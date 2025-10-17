const { prisma } = require('../../config/db');
const { ValidationError } = require('../../core/exceptions');
const { SOStatus } = require('../../core/constants');
const inventoryTransactionService = require('../../core/services/inventoryTransaction.service');

async function createSaleOrder(saleOrderData) {
  const { customer, items, reference, tenantId } = saleOrderData;

  // Validate items exist and belong to tenant
  const itemIds = items.map(item => item.itemId);
  const existingItems = await prisma.item.findMany({
    where: {
      id: { in: itemIds },
      tenantId
    },
    select: { id: true, name: true, sku: true, unit: true, price: true }
  });

  if (existingItems.length !== itemIds.length) {
    throw new ValidationError('One or more items not found or do not belong to tenant');
  }

  // Generate reference if not provided
  const soReference = reference || `SO-${Date.now()}`;

  const saleOrder = await prisma.saleOrder.create({
    data: {
      customer,
      tenantId,
      reference: soReference,
      status: SOStatus.PENDING,
      items: {
        create: items.map(item => {
          const existingItem = existingItems.find(i => i.id === item.itemId);
          return {
            itemId: item.itemId,
            quantity: parseFloat(item.quantity),
            unitPrice: parseFloat(item.unitPrice || existingItem.price || 0)
          };
        })
      }
    },
    include: {
      items: {
        include: {
          item: {
            select: { id: true, name: true, sku: true, unit: true }
          }
        }
      }
    }
  });

  return saleOrder;
}

async function getSaleOrders({ tenantId, page, limit, search, customer, status }) {
  const skip = (page - 1) * limit;
  
  const where = {
    tenantId,
    ...(search && {
      OR: [
        { reference: { contains: search, mode: 'insensitive' } },
        { customer: { contains: search, mode: 'insensitive' } }
      ]
    }),
    ...(customer && { customer: { contains: customer, mode: 'insensitive' } }),
    ...(status && { status })
  };

  const [saleOrders, total] = await Promise.all([
    prisma.saleOrder.findMany({
      where,
      skip,
      take: limit,
      include: {
        items: {
          include: {
            item: {
              select: { id: true, name: true, sku: true, unit: true }
            }
          }
        },
        _count: {
          select: {
            transactions: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.saleOrder.count({ where })
  ]);

  // Calculate totals for each sale order
  const saleOrdersWithTotals = saleOrders.map(so => {
    const totalAmount = so.items.reduce((sum, item) => 
      sum + (parseFloat(item.quantity) * parseFloat(item.unitPrice)), 0
    );

    return {
      ...so,
      totals: {
        totalAmount,
        totalItems: so.items.length,
        totalQuantity: so.items.reduce((sum, item) => sum + parseFloat(item.quantity), 0)
      }
    };
  });

  return {
    data: saleOrdersWithTotals,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}

async function getSaleOrderById(id, tenantId) {
  const saleOrder = await prisma.saleOrder.findFirst({
    where: { id, tenantId },
    include: {
      items: {
        include: {
          item: {
            select: { 
              id: true, 
              name: true, 
              sku: true, 
              unit: true, 
              type: true,
              cost: true,
              price: true,
              stock: {
                include: {
                  warehouse: {
                    select: { id: true, name: true, code: true }
                  }
                }
              }
            }
          }
        }
      },
      transactions: {
        include: {
          item: {
            select: { id: true, name: true, sku: true }
          },
          warehouse: {
            select: { id: true, name: true, code: true }
          },
          createdBy: {
            select: { id: true, name: true, email: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  if (!saleOrder) return null;

  // Calculate detailed totals and profit analysis
  const totals = {
    totalAmount: saleOrder.items.reduce((sum, item) => 
      sum + (parseFloat(item.quantity) * parseFloat(item.unitPrice)), 0
    ),
    totalCost: saleOrder.items.reduce((sum, item) => 
      sum + (parseFloat(item.quantity) * parseFloat(item.item.cost || 0)), 0
    ),
    totalProfit: 0,
    profitMargin: 0
  };

  totals.totalProfit = totals.totalAmount - totals.totalCost;
  totals.profitMargin = totals.totalAmount > 0 ? (totals.totalProfit / totals.totalAmount) * 100 : 0;

  // Check stock availability for each item
  const stockAnalysis = saleOrder.items.map(item => {
    const totalStock = item.item.stock.reduce((sum, stock) => 
      sum + parseFloat(stock.quantity) - parseFloat(stock.reserved), 0
    );
    const orderedQuantity = parseFloat(item.quantity);
    
    return {
      item: item.item,
      orderedQuantity,
      availableStock: totalStock,
      canFulfill: totalStock >= orderedQuantity,
      shortage: Math.max(0, orderedQuantity - totalStock)
    };
  });

  const canFulfillAll = stockAnalysis.every(item => item.canFulfill);

  return {
    ...saleOrder,
    totals,
    stockAnalysis,
    fulfillmentStatus: {
      canFulfillAll,
      itemsWithShortage: stockAnalysis.filter(item => !item.canFulfill),
      totalShortage: stockAnalysis.reduce((sum, item) => sum + item.shortage, 0)
    }
  };
}

async function updateSaleOrder(id, tenantId, updateData) {
  const { items, ...restData } = updateData;

  // Check if SO can be updated (only if status is PENDING)
  const existingSO = await prisma.saleOrder.findFirst({
    where: { id, tenantId },
    select: { status: true }
  });

  if (!existingSO) {
    throw new ValidationError('Sale order not found');
  }

  if (existingSO.status !== SOStatus.PENDING) {
    throw new ValidationError('Only pending sale orders can be updated');
  }

  const saleOrder = await prisma.$transaction(async (tx) => {
    // Update basic info
    const updatedSO = await tx.saleOrder.update({
      where: { id, tenantId },
      data: restData
    });

    // Update items if provided
    if (items) {
      // Delete existing items
      await tx.sOItem.deleteMany({
        where: { soId: id }
      });

      // Create new items
      await tx.sOItem.createMany({
        data: items.map(item => ({
          soId: id,
          itemId: item.itemId,
          quantity: parseFloat(item.quantity),
          unitPrice: parseFloat(item.unitPrice)
        }))
      });
    }

    return updatedSO;
  });

  return await getSaleOrderById(id, tenantId);
}

async function cancelSaleOrder(id, tenantId) {
  const saleOrder = await prisma.saleOrder.findFirst({
    where: { id, tenantId },
    select: { status: true }
  });

  if (!saleOrder) {
    throw new ValidationError('Sale order not found');
  }

  if (saleOrder.status === SOStatus.CANCELLED) {
    throw new ValidationError('Sale order is already cancelled');
  }

  if (saleOrder.status === SOStatus.COMPLETED) {
    throw new ValidationError('Cannot cancel completed sale order');
  }

  const updatedSO = await prisma.saleOrder.update({
    where: { id, tenantId },
    data: { status: SOStatus.CANCELLED }
  });

  return updatedSO;
}

async function fulfillSaleOrder(saleOrderId, fulfilledItems, createdById) {
  // Use the inventory transaction service to process the fulfillment
  const transactions = await inventoryTransactionService.processSaleFulfillment(
    saleOrderId,
    fulfilledItems,
    createdById
  );

  return {
    transactions,
    message: 'Sale order fulfillment processed successfully'
  };
}

async function getSaleOrderItems(saleOrderId, tenantId) {
  const saleOrder = await prisma.saleOrder.findFirst({
    where: { id: saleOrderId, tenantId },
    include: {
      items: {
        include: {
          item: {
            select: { 
              id: true, 
              name: true, 
              sku: true, 
              unit: true, 
              type: true,
              cost: true,
              price: true,
              stock: {
                include: {
                  warehouse: {
                    select: { id: true, name: true, code: true }
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  if (!saleOrder) {
    throw new ValidationError('Sale order not found');
  }

  return saleOrder.items.map(item => {
    const totalStock = item.item.stock.reduce((sum, stock) => 
      sum + parseFloat(stock.quantity) - parseFloat(stock.reserved), 0
    );
    
    return {
      ...item,
      quantity: parseFloat(item.quantity),
      unitPrice: parseFloat(item.unitPrice),
      totalAmount: parseFloat(item.quantity) * parseFloat(item.unitPrice),
      availableStock: totalStock,
      canFulfill: totalStock >= parseFloat(item.quantity),
      stockByWarehouse: item.item.stock.map(stock => ({
        warehouse: stock.warehouse,
        quantity: parseFloat(stock.quantity),
        reserved: parseFloat(stock.reserved),
        available: parseFloat(stock.quantity) - parseFloat(stock.reserved)
      }))
    };
  });
}

module.exports = {
  createSaleOrder,
  getSaleOrders,
  getSaleOrderById,
  updateSaleOrder,
  cancelSaleOrder,
  fulfillSaleOrder,
  getSaleOrderItems
};
