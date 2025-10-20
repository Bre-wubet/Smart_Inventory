const { prisma } = require('../../config/db');
const { ValidationError } = require('../../core/exceptions');
const { POStatus } = require('../../core/constants');
const inventoryTransactionService = require('../../core/services/inventoryTransaction.service');
const { integrationManager } = require('../../integrations');

async function createPurchaseOrder(purchaseOrderData) {
  const { supplierId, items, expectedAt, reference, tenantId } = purchaseOrderData;

  // Verify supplier exists
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId }
  });

  if (!supplier) {
    throw new ValidationError('Supplier not found');
  }

  // Validate items and get supplier costs
  const itemIds = items.map(item => item.itemId);
  const itemSuppliers = await prisma.itemSupplier.findMany({
    where: {
      supplierId,
      itemId: { in: itemIds }
    },
    include: {
      item: {
        select: { id: true, name: true, sku: true, unit: true, tenantId: true }
      }
    }
  });

  // Verify all items belong to tenant and are available from supplier
  const validItems = items.filter(item => {
    const itemSupplier = itemSuppliers.find(is => is.itemId === item.itemId);
    return itemSupplier && itemSupplier.item.tenantId === tenantId;
  });

  if (validItems.length !== items.length) {
    throw new ValidationError('One or more items not found or not available from supplier');
  }

  // Generate reference if not provided
  const poReference = reference || `PO-${Date.now()}`;

  const purchaseOrder = await prisma.purchaseOrder.create({
    data: {
      supplierId,
      tenantId,
      reference: poReference,
      expectedAt,
      status: POStatus.PENDING,
      items: {
        create: validItems.map(item => {
          const itemSupplier = itemSuppliers.find(is => is.itemId === item.itemId);
          return {
            itemId: item.itemId,
            quantity: parseFloat(item.quantity),
            unitCost: parseFloat(itemSupplier.cost)
          };
        })
      }
    },
    include: {
      supplier: {
        select: { id: true, name: true, contact: true, email: true }
      },
      items: {
        include: {
          item: {
            select: { id: true, name: true, sku: true, unit: true }
          }
        }
      }
    }
  });

  return purchaseOrder;
}

async function getPurchaseOrders({ tenantId, page, limit, search, supplierId, status }) {
  const skip = (page - 1) * limit;
  
  const where = {
    tenantId,
    ...(search && {
      OR: [
        { reference: { contains: search, mode: 'insensitive' } },
        { supplier: { name: { contains: search, mode: 'insensitive' } } }
      ]
    }),
    ...(supplierId && { supplierId }),
    ...(status && { status })
  };

  const [purchaseOrders, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      skip,
      take: limit,
      include: {
        supplier: {
          select: { id: true, name: true, contact: true, email: true }
        },
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
    prisma.purchaseOrder.count({ where })
  ]);

  // Calculate totals for each purchase order
  const purchaseOrdersWithTotals = purchaseOrders.map(po => {
    const totalAmount = po.items.reduce((sum, item) => 
      sum + (parseFloat(item.quantity) * parseFloat(item.unitCost)), 0
    );
    const totalReceived = po.items.reduce((sum, item) => 
      sum + parseFloat(item.receivedQty), 0
    );
    const totalOrdered = po.items.reduce((sum, item) => 
      sum + parseFloat(item.quantity), 0
    );

    return {
      ...po,
      totals: {
        totalAmount,
        totalOrdered,
        totalReceived,
        completionPercentage: totalOrdered > 0 ? (totalReceived / totalOrdered) * 100 : 0
      }
    };
  });

  return {
    data: purchaseOrdersWithTotals,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}

async function getPurchaseOrderById(id, tenantId) {
  const purchaseOrder = await prisma.purchaseOrder.findFirst({
    where: { id, tenantId },
    include: {
      supplier: {
        select: { id: true, name: true, contact: true, email: true, phone: true, address: true }
      },
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
              price: true
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

  if (!purchaseOrder) return null;

  // Calculate detailed totals and status
  const totals = {
    totalAmount: purchaseOrder.items.reduce((sum, item) => 
      sum + (parseFloat(item.quantity) * parseFloat(item.unitCost)), 0
    ),
    totalOrdered: purchaseOrder.items.reduce((sum, item) => 
      sum + parseFloat(item.quantity), 0
    ),
    totalReceived: purchaseOrder.items.reduce((sum, item) => 
      sum + parseFloat(item.receivedQty), 0
    ),
    totalOutstanding: purchaseOrder.items.reduce((sum, item) => 
      sum + (parseFloat(item.quantity) - parseFloat(item.receivedQty)), 0
    )
  };

  const completionPercentage = totals.totalOrdered > 0 ? (totals.totalReceived / totals.totalOrdered) * 100 : 0;

  return {
    ...purchaseOrder,
    totals: {
      ...totals,
      completionPercentage
    },
    statusAnalysis: {
      isFullyReceived: totals.totalOutstanding === 0,
      isPartiallyReceived: totals.totalReceived > 0 && totals.totalOutstanding > 0,
      isPending: totals.totalReceived === 0
    }
  };
}

async function updatePurchaseOrder(id, tenantId, updateData) {
  const { items, ...restData } = updateData;

  // Check if PO can be updated (only if status is PENDING)
  const existingPO = await prisma.purchaseOrder.findFirst({
    where: { id, tenantId },
    select: { status: true }
  });

  if (!existingPO) {
    throw new ValidationError('Purchase order not found');
  }

  if (existingPO.status !== POStatus.PENDING) {
    throw new ValidationError('Only pending purchase orders can be updated');
  }

  const purchaseOrder = await prisma.$transaction(async (tx) => {
    // Update basic info
    const updatedPO = await tx.purchaseOrder.update({
      where: { id, tenantId },
      data: restData
    });

    // Update items if provided
    if (items) {
      // Delete existing items
      await tx.pOItem.deleteMany({
        where: { poId: id }
      });

      // Create new items
      await tx.pOItem.createMany({
        data: items.map(item => ({
          poId: id,
          itemId: item.itemId,
          quantity: parseFloat(item.quantity),
          unitCost: parseFloat(item.unitCost)
        }))
      });
    }

    return updatedPO;
  });

  return await getPurchaseOrderById(id, tenantId);
}

async function cancelPurchaseOrder(id, tenantId) {
  const purchaseOrder = await prisma.purchaseOrder.findFirst({
    where: { id, tenantId },
    select: { status: true }
  });

  if (!purchaseOrder) {
    throw new ValidationError('Purchase order not found');
  }

  if (purchaseOrder.status === POStatus.CANCELLED) {
    throw new ValidationError('Purchase order is already cancelled');
  }

  if (purchaseOrder.status === POStatus.RECEIVED) {
    throw new ValidationError('Cannot cancel fully received purchase order');
  }

  const updatedPO = await prisma.purchaseOrder.update({
    where: { id, tenantId },
    data: { status: POStatus.CANCELLED }
  });

  return updatedPO;
}

async function receivePurchaseOrder(purchaseOrderId, receivedItems, createdById) {
  // Use the inventory transaction service to process the receipt
  const transactions = await inventoryTransactionService.processPurchaseReceipt(
    purchaseOrderId,
    receivedItems,
    createdById
  );

  return {
    transactions,
    message: 'Purchase order receipt processed successfully'
  };
}

async function getPurchaseOrderItems(purchaseOrderId, tenantId) {
  const purchaseOrder = await prisma.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, tenantId },
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
              price: true
            }
          }
        }
      }
    }
  });

  if (!purchaseOrder) {
    throw new ValidationError('Purchase order not found');
  }

  return purchaseOrder.items.map(item => ({
    ...item,
    quantity: parseFloat(item.quantity),
    unitCost: parseFloat(item.unitCost),
    receivedQty: parseFloat(item.receivedQty),
    outstandingQty: parseFloat(item.quantity) - parseFloat(item.receivedQty),
    totalAmount: parseFloat(item.quantity) * parseFloat(item.unitCost),
    receivedAmount: parseFloat(item.receivedQty) * parseFloat(item.unitCost)
  }));
}

async function generatePurchaseOrder({ items, supplierId, warehouseId, tenantId }) {
  // This function can be used to automatically generate POs based on low stock or reorder points
  // For now, it's a simplified version that creates a PO with the provided items

  if (!supplierId) {
    throw new ValidationError('supplierId is required for automatic PO generation');
  }

  // Get supplier costs for items
  const itemIds = items.map(item => item.itemId);
  const itemSuppliers = await prisma.itemSupplier.findMany({
    where: {
      supplierId,
      itemId: { in: itemIds }
    },
    include: {
      item: {
        select: { id: true, name: true, sku: true, unit: true, tenantId: true }
      }
    }
  });

  // Filter items that are available from the supplier
  const validItems = items.filter(item => {
    const itemSupplier = itemSuppliers.find(is => is.itemId === item.itemId);
    return itemSupplier && itemSupplier.item.tenantId === tenantId;
  });

  if (validItems.length === 0) {
    throw new ValidationError('No items available from the specified supplier');
  }

  // Create the purchase order
  const purchaseOrder = await createPurchaseOrder({
    supplierId,
    items: validItems.map(item => ({
      itemId: item.itemId,
      quantity: item.quantity || item.reorderQuantity || 1
    })),
    tenantId,
    reference: `AUTO-PO-${Date.now()}`
  });

  return purchaseOrder;
}

module.exports = {
  createPurchaseOrder,
  getPurchaseOrders,
  getPurchaseOrderById,
  updatePurchaseOrder,
  cancelPurchaseOrder,
  receivePurchaseOrder,
  getPurchaseOrderItems,
  generatePurchaseOrder
};
