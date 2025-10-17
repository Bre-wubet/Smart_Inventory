const { prisma } = require('../../config/db');
const { ValidationError } = require('../../core/exceptions');
const { calculateAvailableStock } = require('../../core/utils/stockFormulas');

async function createItem(itemData) {
  const { sku, name, description, unit, type, cost, price, tenantId } = itemData;

  // Check if SKU already exists
  const existingItem = await prisma.item.findUnique({
    where: { sku }
  });

  if (existingItem) {
    throw new ValidationError('SKU already exists');
  }

  const item = await prisma.item.create({
    data: {
      sku,
      name,
      description,
      unit,
      type: type || 'RAW',
      cost,
      price,
      tenantId
    },
    include: {
      tenant: {
        select: { id: true, name: true }
      }
    }
  });

  return item;
}

async function getItems({ tenantId, page, limit, search, type, isActive }) {
  const skip = (page - 1) * limit;
  
  const where = {
    tenantId,
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ]
    }),
    ...(type && { type }),
    ...(isActive !== undefined && { isActive })
  };

  const [items, total] = await Promise.all([
    prisma.item.findMany({
      where,
      skip,
      take: limit,
      include: {
        stock: {
          include: {
            warehouse: {
              select: { id: true, name: true, code: true }
            }
          }
        },
        _count: {
          select: {
            transactions: true,
            alerts: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.item.count({ where })
  ]);

  // Calculate available stock for each item
  const itemsWithStock = items.map(item => ({
    ...item,
    totalStock: item.stock.reduce((sum, stock) => sum + parseFloat(stock.quantity), 0),
    availableStock: item.stock.reduce((sum, stock) => 
      sum + calculateAvailableStock(stock.quantity, stock.reserved), 0
    ),
    stockByWarehouse: item.stock.map(stock => ({
      warehouseId: stock.warehouse.id,
      warehouseName: stock.warehouse.name,
      warehouseCode: stock.warehouse.code,
      quantity: parseFloat(stock.quantity),
      reserved: parseFloat(stock.reserved),
      available: calculateAvailableStock(stock.quantity, stock.reserved)
    }))
  }));

  return {
    data: itemsWithStock,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}

async function getItemById(id, tenantId) {
  const item = await prisma.item.findFirst({
    where: { id, tenantId },
    include: {
      tenant: {
        select: { id: true, name: true }
      },
      stock: {
        include: {
          warehouse: {
            select: { id: true, name: true, code: true, location: true }
          }
        }
      },
      suppliers: {
        include: {
          supplier: {
            select: { id: true, name: true, contact: true, email: true }
          }
        }
      },
      recipeItems: {
        include: {
          recipe: {
            select: { id: true, name: true, description: true }
          }
        }
      },
      recipes: {
        include: {
          items: {
            include: {
              item: {
                select: { id: true, name: true, sku: true }
              }
            }
          }
        }
      }
    }
  });

  if (!item) return null;

  // Calculate stock summary
  const stockSummary = {
    totalStock: item.stock.reduce((sum, stock) => sum + parseFloat(stock.quantity), 0),
    totalReserved: item.stock.reduce((sum, stock) => sum + parseFloat(stock.reserved), 0),
    totalAvailable: item.stock.reduce((sum, stock) => 
      sum + calculateAvailableStock(stock.quantity, stock.reserved), 0
    ),
    stockByWarehouse: item.stock.map(stock => ({
      warehouseId: stock.warehouse.id,
      warehouseName: stock.warehouse.name,
      warehouseCode: stock.warehouse.code,
      location: stock.warehouse.location,
      quantity: parseFloat(stock.quantity),
      reserved: parseFloat(stock.reserved),
      available: calculateAvailableStock(stock.quantity, stock.reserved)
    }))
  };

  return {
    ...item,
    stockSummary
  };
}

async function updateItem(id, tenantId, updateData) {
  const { sku, ...restData } = updateData;

  // If SKU is being updated, check for conflicts
  if (sku) {
    const existingItem = await prisma.item.findFirst({
      where: { sku, NOT: { id } }
    });

    if (existingItem) {
      throw new ValidationError('SKU already exists');
    }
  }

  const item = await prisma.item.update({
    where: { id, tenantId },
    data: {
      ...restData,
      ...(sku && { sku })
    },
    include: {
      tenant: {
        select: { id: true, name: true }
      }
    }
  });

  return item;
}

async function deleteItem(id, tenantId) {
  // Check if item has any stock or transactions
  const [stockCount, transactionCount] = await Promise.all([
    prisma.stock.count({ where: { itemId: id } }),
    prisma.inventoryTransaction.count({ where: { itemId: id } })
  ]);

  if (stockCount > 0 || transactionCount > 0) {
    // Soft delete - mark as inactive
    await prisma.item.update({
      where: { id, tenantId },
      data: { isActive: false }
    });
    return true;
  } else {
    // Hard delete if no dependencies
    await prisma.item.delete({
      where: { id, tenantId }
    });
    return true;
  }
}

async function getItemStock(itemId, tenantId) {
  const item = await prisma.item.findFirst({
    where: { id: itemId, tenantId },
    select: { id: true, name: true, sku: true }
  });

  if (!item) return null;

  const stock = await prisma.stock.findMany({
    where: { itemId },
    include: {
      warehouse: {
        select: { id: true, name: true, code: true, location: true }
      }
    }
  });

  const stockSummary = {
    item,
    totalStock: stock.reduce((sum, s) => sum + parseFloat(s.quantity), 0),
    totalReserved: stock.reduce((sum, s) => sum + parseFloat(s.reserved), 0),
    totalAvailable: stock.reduce((sum, s) => 
      sum + calculateAvailableStock(s.quantity, s.reserved), 0
    ),
    warehouses: stock.map(s => ({
      warehouseId: s.warehouse.id,
      warehouseName: s.warehouse.name,
      warehouseCode: s.warehouse.code,
      location: s.warehouse.location,
      quantity: parseFloat(s.quantity),
      reserved: parseFloat(s.reserved),
      available: calculateAvailableStock(s.quantity, s.reserved),
      lastUpdated: s.updatedAt
    }))
  };

  return stockSummary;
}

async function getItemTransactions(itemId, tenantId, { page, limit }) {
  const skip = (page - 1) * limit;

  const [transactions, total] = await Promise.all([
    prisma.inventoryTransaction.findMany({
      where: { itemId },
      skip,
      take: limit,
      include: {
        item: {
          select: { id: true, name: true, sku: true }
        },
        warehouse: {
          select: { id: true, name: true, code: true }
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
    prisma.inventoryTransaction.count({ where: { itemId } })
  ]);

  return {
    data: transactions,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}

module.exports = {
  createItem,
  getItems,
  getItemById,
  updateItem,
  deleteItem,
  getItemStock,
  getItemTransactions
};
