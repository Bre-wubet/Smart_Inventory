const { prisma } = require('../../config/db');
const { ValidationError } = require('../../core/exceptions');
const { TransactionType } = require('../../core/constants');
const inventoryTransactionService = require('../../core/services/inventoryTransaction.service');

async function createWarehouse(warehouseData) {
  const { name, code, location, tenantId } = warehouseData;

  // Check if code already exists (if provided)
  if (code) {
    const existingWarehouse = await prisma.warehouse.findUnique({
      where: { code }
    });

    if (existingWarehouse) {
      throw new ValidationError('Warehouse code already exists');
    }
  }

  const warehouse = await prisma.warehouse.create({
    data: {
      name,
      code,
      location,
      tenantId
    },
    include: {
      tenant: {
        select: { id: true, name: true }
      }
    }
  });

  return warehouse;
}

async function getWarehouses({ tenantId, page, limit, search }) {
  const skip = (page - 1) * limit;
  
  const where = {
    tenantId,
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } }
      ]
    })
  };

  const [warehouses, total] = await Promise.all([
    prisma.warehouse.findMany({
      where,
      skip,
      take: limit,
      include: {
        _count: {
          select: {
            stock: true,
            transactions: true,
            alerts: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.warehouse.count({ where })
  ]);

  // Calculate stock summary for each warehouse
  const warehousesWithStock = await Promise.all(
    warehouses.map(async (warehouse) => {
      const stockSummary = await prisma.stock.aggregate({
        where: { warehouseId: warehouse.id },
        _sum: {
          quantity: true,
          reserved: true
        },
        _count: {
          itemId: true
        }
      });

      return {
        ...warehouse,
        stockSummary: {
          totalItems: stockSummary._count.itemId,
          totalQuantity: parseFloat(stockSummary._sum.quantity || 0),
          totalReserved: parseFloat(stockSummary._sum.reserved || 0),
          totalAvailable: parseFloat(stockSummary._sum.quantity || 0) - parseFloat(stockSummary._sum.reserved || 0)
        }
      };
    })
  );

  return {
    data: warehousesWithStock,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}

async function getWarehouseById(id, tenantId) {
  const warehouse = await prisma.warehouse.findFirst({
    where: { id, tenantId },
    include: {
      tenant: {
        select: { id: true, name: true }
      },
      stock: {
        include: {
          item: {
            select: { id: true, name: true, sku: true, unit: true, type: true }
          }
        }
      }
    }
  });

  if (!warehouse) return null;

  // Calculate detailed stock summary
  const stockSummary = await prisma.stock.aggregate({
    where: { warehouseId: id },
    _sum: {
      quantity: true,
      reserved: true
    },
    _count: {
      itemId: true
    }
  });

  const stockByType = await prisma.stock.groupBy({
    by: ['item'],
    where: { warehouseId: id },
    _sum: {
      quantity: true,
      reserved: true
    },
    include: {
      item: {
        select: { type: true }
      }
    }
  });

  return {
    ...warehouse,
    stockSummary: {
      totalItems: stockSummary._count.itemId,
      totalQuantity: parseFloat(stockSummary._sum.quantity || 0),
      totalReserved: parseFloat(stockSummary._sum.reserved || 0),
      totalAvailable: parseFloat(stockSummary._sum.quantity || 0) - parseFloat(stockSummary._sum.reserved || 0)
    },
    stockByType: stockByType.reduce((acc, group) => {
      const type = group.item.type;
      if (!acc[type]) {
        acc[type] = { quantity: 0, reserved: 0, available: 0 };
      }
      acc[type].quantity += parseFloat(group._sum.quantity || 0);
      acc[type].reserved += parseFloat(group._sum.reserved || 0);
      acc[type].available += parseFloat(group._sum.quantity || 0) - parseFloat(group._sum.reserved || 0);
      return acc;
    }, {})
  };
}

async function updateWarehouse(id, tenantId, updateData) {
  const { code, ...restData } = updateData;

  // If code is being updated, check for conflicts
  if (code) {
    const existingWarehouse = await prisma.warehouse.findFirst({
      where: { code, NOT: { id } }
    });

    if (existingWarehouse) {
      throw new ValidationError('Warehouse code already exists');
    }
  }

  const warehouse = await prisma.warehouse.update({
    where: { id, tenantId },
    data: {
      ...restData,
      ...(code && { code })
    },
    include: {
      tenant: {
        select: { id: true, name: true }
      }
    }
  });

  return warehouse;
}

async function deleteWarehouse(id, tenantId) {
  // Check if warehouse has any stock or transactions
  const [stockCount, transactionCount] = await Promise.all([
    prisma.stock.count({ where: { warehouseId: id } }),
    prisma.inventoryTransaction.count({ where: { warehouseId: id } })
  ]);

  if (stockCount > 0 || transactionCount > 0) {
    throw new ValidationError('Cannot delete warehouse with existing stock or transactions');
  }

  await prisma.warehouse.delete({
    where: { id, tenantId }
  });

  return true;
}

async function getWarehouseStock(warehouseId, tenantId, { page, limit }) {
  const skip = (page - 1) * limit;

  // Verify warehouse belongs to tenant
  const warehouse = await prisma.warehouse.findFirst({
    where: { id: warehouseId, tenantId },
    select: { id: true, name: true, code: true }
  });

  if (!warehouse) {
    throw new ValidationError('Warehouse not found');
  }

  const [stock, total] = await Promise.all([
    prisma.stock.findMany({
      where: { warehouseId },
      skip,
      take: limit,
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
      },
      orderBy: { updatedAt: 'desc' }
    }),
    prisma.stock.count({ where: { warehouseId } })
  ]);

  const stockWithCalculations = stock.map(s => ({
    ...s,
    quantity: parseFloat(s.quantity),
    reserved: parseFloat(s.reserved),
    available: parseFloat(s.quantity) - parseFloat(s.reserved),
    value: parseFloat(s.quantity) * parseFloat(s.item.cost || 0)
  }));

  return {
    warehouse,
    data: stockWithCalculations,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}

async function getWarehouseTransactions(warehouseId, tenantId, { page, limit }) {
  const skip = (page - 1) * limit;

  // Verify warehouse belongs to tenant
  const warehouse = await prisma.warehouse.findFirst({
    where: { id: warehouseId, tenantId },
    select: { id: true, name: true, code: true }
  });

  if (!warehouse) {
    throw new ValidationError('Warehouse not found');
  }

  const [transactions, total] = await Promise.all([
    prisma.inventoryTransaction.findMany({
      where: { warehouseId },
      skip,
      take: limit,
      include: {
        item: {
          select: { id: true, name: true, sku: true }
        },
        createdBy: {
          select: { id: true, name: true, email: true }
        },
        purchaseOrder: {
          select: { id: true, reference: true }
        },
        saleOrder: {
          select: { id: true, reference: true }
        },
        productionBatch: {
          select: { id: true, batchRef: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.inventoryTransaction.count({ where: { warehouseId } })
  ]);

  return {
    warehouse,
    data: transactions,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}

async function transferStock({ fromWarehouseId, toWarehouseId, itemId, quantity, note, createdById }) {
  // Verify both warehouses exist and belong to the same tenant
  const [fromWarehouse, toWarehouse] = await Promise.all([
    prisma.warehouse.findUnique({ where: { id: fromWarehouseId } }),
    prisma.warehouse.findUnique({ where: { id: toWarehouseId } })
  ]);

  if (!fromWarehouse || !toWarehouse) {
    throw new ValidationError('One or both warehouses not found');
  }

  if (fromWarehouse.tenantId !== toWarehouse.tenantId) {
    throw new ValidationError('Warehouses must belong to the same tenant');
  }

  // Check if source warehouse has sufficient stock
  const sourceStock = await prisma.stock.findUnique({
    where: {
      warehouseId_itemId: {
        warehouseId: fromWarehouseId,
        itemId
      }
    }
  });

  if (!sourceStock || parseFloat(sourceStock.quantity) < quantity) {
    throw new ValidationError('Insufficient stock in source warehouse');
  }

  const reference = `TRANSFER-${Date.now()}`;

  // Create transactions for both warehouses
  const [outTransaction, inTransaction] = await Promise.all([
    inventoryTransactionService.createTransaction({
      type: TransactionType.TRANSFER,
      itemId,
      warehouseId: fromWarehouseId,
      quantity: -quantity, // Negative quantity for outgoing
      reference,
      createdById,
      note: `Transfer to ${toWarehouse.name} - ${note || ''}`
    }),
    inventoryTransactionService.createTransaction({
      type: TransactionType.TRANSFER,
      itemId,
      warehouseId: toWarehouseId,
      quantity: quantity, // Positive quantity for incoming
      reference,
      createdById,
      note: `Transfer from ${fromWarehouse.name} - ${note || ''}`
    })
  ]);

  return {
    transfer: {
      reference,
      fromWarehouse: fromWarehouse.name,
      toWarehouse: toWarehouse.name,
      quantity
    },
    transactions: [outTransaction, inTransaction]
  };
}

async function adjustStock({ warehouseId, itemId, quantity, reason, note, createdById }) {
  // Verify warehouse exists
  const warehouse = await prisma.warehouse.findUnique({
    where: { id: warehouseId }
  });

  if (!warehouse) {
    throw new ValidationError('Warehouse not found');
  }

  // Get current stock
  const stock = await prisma.stock.findUnique({
    where: {
      warehouseId_itemId: {
        warehouseId,
        itemId
      }
    }
  });

  if (!stock) {
    throw new ValidationError('Item not found in warehouse');
  }

  const currentQuantity = parseFloat(stock.quantity);
  const adjustmentQuantity = parseFloat(quantity);
  const newQuantity = currentQuantity + adjustmentQuantity;

  // Check for negative stock after adjustment
  if (newQuantity < 0) {
    throw new ValidationError('Stock adjustment would result in negative inventory');
  }

  const reference = `ADJUST-${Date.now()}`;

  // Create adjustment transaction
  const transaction = await inventoryTransactionService.createTransaction({
    type: TransactionType.ADJUSTMENT,
    itemId,
    warehouseId,
    quantity: adjustmentQuantity,
    reference,
    createdById,
    note: `Stock adjustment - ${reason || 'Manual adjustment'} - ${note || ''}`
  });

  return {
    adjustment: {
      reference,
      warehouse: warehouse.name,
      itemId,
      previousQuantity: currentQuantity,
      adjustmentQuantity,
      newQuantity,
      reason
    },
    transaction
  };
}

module.exports = {
  createWarehouse,
  getWarehouses,
  getWarehouseById,
  updateWarehouse,
  deleteWarehouse,
  getWarehouseStock,
  getWarehouseTransactions,
  transferStock,
  adjustStock
};
