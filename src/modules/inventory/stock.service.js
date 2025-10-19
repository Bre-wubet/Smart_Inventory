const { prisma } = require('../../config/db');
const { ValidationError, NotFoundError } = require('../../core/exceptions');
const { 
  calculateAvailableStock, 
  isLowStock, 
  isOverstocked,
  calculateStockTurnover,
  calculateDaysOfInventory,
  calculateEOQ,
  calculateSafetyStock
} = require('../../core/utils/stockFormulas');
const { calculateWeightedAverageCost } = require('../../core/utils/costCalculation');
const { TransactionType, MovementType, AlertType } = require('../../core/constants');

async function getStockOverview(tenantId, filters = {}) {
  const { warehouseId, itemType, lowStockOnly = false, overstockOnly = false } = filters;

  const where = {
    item: { tenantId },
    ...(warehouseId && { warehouseId }),
    ...(itemType && { item: { type: itemType } })
  };

  const stockRecords = await prisma.stock.findMany({
    where,
    include: {
      item: {
        select: {
          id: true,
          sku: true,
          name: true,
          type: true,
          cost: true,
          price: true,
          unit: true
        }
      },
      warehouse: {
        select: {
          id: true,
          name: true,
          code: true,
          location: true
        }
      },
      movements: {
        take: 5,
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  // Calculate stock metrics
  const stockMetrics = stockRecords.map(stock => {
    const available = calculateAvailableStock(stock.quantity, stock.reserved);
    const totalValue = parseFloat(stock.quantity) * parseFloat(stock.item.cost);
    const availableValue = available * parseFloat(stock.item.cost);

    return {
      ...stock,
      available,
      totalValue,
      availableValue,
      isLow: isLowStock(parseFloat(stock.quantity), parseFloat(stock.quantity) * 2), // Simplified
      isOverstocked: isOverstocked(parseFloat(stock.quantity), parseFloat(stock.quantity) * 0.5) // Simplified
    };
  });

  // Apply filters
  let filteredStock = stockMetrics;
  if (lowStockOnly) {
    filteredStock = stockMetrics.filter(stock => stock.isLow);
  }
  if (overstockOnly) {
    filteredStock = stockMetrics.filter(stock => stock.isOverstocked);
  }

  // Calculate summary statistics
  const summary = {
    totalItems: filteredStock.length,
    totalQuantity: filteredStock.reduce((sum, stock) => sum + parseFloat(stock.quantity), 0),
    totalReserved: filteredStock.reduce((sum, stock) => sum + parseFloat(stock.reserved), 0),
    totalAvailable: filteredStock.reduce((sum, stock) => sum + stock.available, 0),
    totalValue: filteredStock.reduce((sum, stock) => sum + stock.totalValue, 0),
    availableValue: filteredStock.reduce((sum, stock) => sum + stock.availableValue, 0),
    lowStockItems: filteredStock.filter(stock => stock.isLow).length,
    overstockedItems: filteredStock.filter(stock => stock.isOverstocked).length
  };

  return {
    summary,
    stock: filteredStock
  };
}

async function getItemStockLevels(itemId, tenantId) {
  const item = await prisma.item.findFirst({
    where: { id: itemId, tenantId },
    select: { id: true, name: true, sku: true, type: true, unit: true }
  });

  if (!item) {
    throw new NotFoundError('Item not found');
  }

  const stockRecords = await prisma.stock.findMany({
    where: { itemId },
    include: {
      warehouse: {
        select: {
          id: true,
          name: true,
          code: true,
          location: true
        }
      },
      movements: {
        take: 10,
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  const stockLevels = stockRecords.map(stock => ({
    warehouseId: stock.warehouse.id,
    warehouseName: stock.warehouse.name,
    warehouseCode: stock.warehouse.code,
    location: stock.warehouse.location,
    quantity: parseFloat(stock.quantity),
    reserved: parseFloat(stock.reserved),
    available: calculateAvailableStock(stock.quantity, stock.reserved),
    lastUpdated: stock.updatedAt,
    recentMovements: stock.movements.map(movement => ({
      id: movement.id,
      type: movement.type,
      quantity: parseFloat(movement.quantity),
      reference: movement.reference,
      createdAt: movement.createdAt
    }))
  }));

  const summary = {
    item,
    totalQuantity: stockLevels.reduce((sum, level) => sum + level.quantity, 0),
    totalReserved: stockLevels.reduce((sum, level) => sum + level.reserved, 0),
    totalAvailable: stockLevels.reduce((sum, level) => sum + level.available, 0),
    warehouseCount: stockLevels.length
  };

  return {
    summary,
    stockLevels
  };
}

async function transferStock(transferData) {
  const {
    itemId,
    fromWarehouseId,
    toWarehouseId,
    quantity,
    reference,
    createdById,
    note
  } = transferData;

  if (!itemId || !fromWarehouseId || !toWarehouseId || !quantity) {
    throw new ValidationError('Item ID, warehouses, and quantity are required');
  }

  if (fromWarehouseId === toWarehouseId) {
    throw new ValidationError('Source and destination warehouses cannot be the same');
  }

  const transferQty = parseFloat(quantity);
  if (transferQty <= 0) {
    throw new ValidationError('Transfer quantity must be positive');
  }

  // Check source stock availability
  const sourceStock = await prisma.stock.findUnique({
    where: {
      warehouseId_itemId: {
        warehouseId: fromWarehouseId,
        itemId
      }
    }
  });

  if (!sourceStock) {
    throw new NotFoundError('Source stock not found');
  }

  const availableStock = calculateAvailableStock(sourceStock.quantity, sourceStock.reserved);
  if (availableStock < transferQty) {
    throw new ValidationError('Insufficient stock for transfer');
  }

  // Get or create destination stock
  let destStock = await prisma.stock.findUnique({
    where: {
      warehouseId_itemId: {
        warehouseId: toWarehouseId,
        itemId
      }
    }
  });

  if (!destStock) {
    destStock = await prisma.stock.create({
      data: {
        warehouseId: toWarehouseId,
        itemId,
        quantity: 0,
        reserved: 0
      }
    });
  }

  // Perform transfer in transaction
  const result = await prisma.$transaction(async (tx) => {
    // Update source stock (decrease)
    const updatedSourceStock = await tx.stock.update({
      where: { id: sourceStock.id },
      data: { quantity: parseFloat(sourceStock.quantity) - transferQty }
    });

    // Update destination stock (increase)
    const updatedDestStock = await tx.stock.update({
      where: { id: destStock.id },
      data: { quantity: parseFloat(destStock.quantity) + transferQty }
    });

    // Create outbound transaction
    const outboundTransaction = await tx.inventoryTransaction.create({
      data: {
        type: TransactionType.TRANSFER,
        itemId,
        warehouseId: fromWarehouseId,
        stockId: sourceStock.id,
        quantity: transferQty,
        reference: reference || `TRANSFER-${Date.now()}`,
        createdById,
        note: note || `Transfer to ${toWarehouseId}`
      }
    });

    // Create inbound transaction
    const inboundTransaction = await tx.inventoryTransaction.create({
      data: {
        type: TransactionType.TRANSFER,
        itemId,
        warehouseId: toWarehouseId,
        stockId: destStock.id,
        quantity: transferQty,
        reference: reference || `TRANSFER-${Date.now()}`,
        createdById,
        note: note || `Transfer from ${fromWarehouseId}`
      }
    });

    // Create stock movements
    await tx.stockMovement.createMany({
      data: [
        {
          stockId: sourceStock.id,
          type: MovementType.OUT,
          quantity: transferQty,
          reference: reference || `TRANSFER-${Date.now()}`,
          createdBy: createdById
        },
        {
          stockId: destStock.id,
          type: MovementType.IN,
          quantity: transferQty,
          reference: reference || `TRANSFER-${Date.now()}`,
          createdBy: createdById
        }
      ]
    });

    return {
      outboundTransaction,
      inboundTransaction,
      updatedSourceStock,
      updatedDestStock
    };
  });

  return result;
}

async function reserveStock(reservationData) {
  const {
    itemId,
    warehouseId,
    quantity,
    reference,
    createdById,
    note
  } = reservationData;

  if (!itemId || !warehouseId || !quantity) {
    throw new ValidationError('Item ID, warehouse ID, and quantity are required');
  }

  const reserveQty = parseFloat(quantity);
  if (reserveQty <= 0) {
    throw new ValidationError('Reservation quantity must be positive');
  }

  const stock = await prisma.stock.findUnique({
    where: {
      warehouseId_itemId: {
        warehouseId,
        itemId
      }
    }
  });

  if (!stock) {
    throw new NotFoundError('Stock not found');
  }

  const availableStock = calculateAvailableStock(stock.quantity, stock.reserved);
  if (availableStock < reserveQty) {
    throw new ValidationError('Insufficient stock for reservation');
  }

  const updatedStock = await prisma.stock.update({
    where: { id: stock.id },
    data: { reserved: parseFloat(stock.reserved) + reserveQty }
  });

  // Create reservation transaction
  const transaction = await prisma.inventoryTransaction.create({
    data: {
      type: TransactionType.MANUAL,
      itemId,
      warehouseId,
      stockId: stock.id,
      quantity: 0, // No physical movement
      reference: reference || `RESERVE-${Date.now()}`,
      createdById,
      note: note || `Stock reservation - ${reserveQty} units`
    }
  });

  return {
    transaction,
    updatedStock,
    reservedQuantity: reserveQty
  };
}

async function releaseStock(releaseData) {
  const {
    itemId,
    warehouseId,
    quantity,
    reference,
    createdById,
    note
  } = releaseData;

  if (!itemId || !warehouseId || !quantity) {
    throw new ValidationError('Item ID, warehouse ID, and quantity are required');
  }

  const releaseQty = parseFloat(quantity);
  if (releaseQty <= 0) {
    throw new ValidationError('Release quantity must be positive');
  }

  const stock = await prisma.stock.findUnique({
    where: {
      warehouseId_itemId: {
        warehouseId,
        itemId
      }
    }
  });

  if (!stock) {
    throw new NotFoundError('Stock not found');
  }

  if (parseFloat(stock.reserved) < releaseQty) {
    throw new ValidationError('Cannot release more than reserved quantity');
  }

  const updatedStock = await prisma.stock.update({
    where: { id: stock.id },
    data: { reserved: parseFloat(stock.reserved) - releaseQty }
  });

  // Create release transaction
  const transaction = await prisma.inventoryTransaction.create({
    data: {
      type: TransactionType.MANUAL,
      itemId,
      warehouseId,
      stockId: stock.id,
      quantity: 0, // No physical movement
      reference: reference || `RELEASE-${Date.now()}`,
      createdById,
      note: note || `Stock release - ${releaseQty} units`
    }
  });

  return {
    transaction,
    updatedStock,
    releasedQuantity: releaseQty
  };
}

async function adjustStock(adjustmentData) {
  const {
    itemId,
    warehouseId,
    quantity,
    adjustmentType,
    reference,
    createdById,
    note
  } = adjustmentData;

  if (!itemId || !warehouseId || !quantity || !adjustmentType) {
    throw new ValidationError('Item ID, warehouse ID, quantity, and adjustment type are required');
  }

  const adjustQty = parseFloat(quantity);
  if (adjustQty <= 0) {
    throw new ValidationError('Adjustment quantity must be positive');
  }

  if (!['INCREASE', 'DECREASE'].includes(adjustmentType)) {
    throw new ValidationError('Adjustment type must be INCREASE or DECREASE');
  }

  const stock = await prisma.stock.findUnique({
    where: {
      warehouseId_itemId: {
        warehouseId,
        itemId
      }
    }
  });

  if (!stock) {
    throw new NotFoundError('Stock not found');
  }

  const currentQty = parseFloat(stock.quantity);
  const newQty = adjustmentType === 'INCREASE' 
    ? currentQty + adjustQty 
    : currentQty - adjustQty;

  if (newQty < 0) {
    throw new ValidationError('Stock adjustment would result in negative quantity');
  }

  const updatedStock = await prisma.stock.update({
    where: { id: stock.id },
    data: { quantity: newQty }
  });

  // Create adjustment transaction
  const transaction = await prisma.inventoryTransaction.create({
    data: {
      type: TransactionType.ADJUSTMENT,
      itemId,
      warehouseId,
      stockId: stock.id,
      quantity: adjustQty,
      reference: reference || `ADJUST-${Date.now()}`,
      createdById,
      note: note || `Stock ${adjustmentType.toLowerCase()} - ${adjustQty} units`
    }
  });

  // Create stock movement
  await prisma.stockMovement.create({
    data: {
      stockId: stock.id,
      type: adjustmentType === 'INCREASE' ? MovementType.IN : MovementType.OUT,
      quantity: adjustQty,
      reference: reference || `ADJUST-${Date.now()}`,
      createdBy: createdById
    }
  });

  return {
    transaction,
    updatedStock,
    adjustmentQuantity: adjustQty,
    adjustmentType
  };
}

async function getStockMovements(filters = {}) {
  const {
    itemId,
    warehouseId,
    movementType,
    startDate,
    endDate,
    page = 1,
    limit = 20
  } = filters;

  const skip = (page - 1) * limit;

  const where = {
    ...(itemId && { stock: { itemId } }),
    ...(warehouseId && { stock: { warehouseId } }),
    ...(movementType && { type: movementType }),
    ...(startDate && endDate && {
      createdAt: {
        gte: new Date(startDate),
        lte: new Date(endDate)
      }
    })
  };

  const [movements, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      skip,
      take: limit,
      include: {
        stock: {
          include: {
            item: {
              select: { id: true, name: true, sku: true }
            },
            warehouse: {
              select: { id: true, name: true, code: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.stockMovement.count({ where })
  ]);

  return {
    data: movements,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}

async function getStockAnalytics(itemId, tenantId, options = {}) {
  const { period = 30, warehouseId } = period;

  const item = await prisma.item.findFirst({
    where: { id: itemId, tenantId },
    select: { id: true, name: true, sku: true, type: true }
  });

  if (!item) {
    throw new NotFoundError('Item not found');
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);

  // Get stock movements for the period
  const movements = await prisma.stockMovement.findMany({
    where: {
      stock: {
        itemId,
        ...(warehouseId && { warehouseId })
      },
      createdAt: { gte: startDate }
    },
    include: {
      stock: {
        include: {
          warehouse: {
            select: { id: true, name: true, code: true }
          }
        }
      }
    },
    orderBy: { createdAt: 'asc' }
  });

  // Calculate analytics
  const inboundMovements = movements.filter(m => m.type === MovementType.IN);
  const outboundMovements = movements.filter(m => m.type === MovementType.OUT);

  const totalInbound = inboundMovements.reduce((sum, m) => sum + parseFloat(m.quantity), 0);
  const totalOutbound = outboundMovements.reduce((sum, m) => sum + parseFloat(m.quantity), 0);
  const netMovement = totalInbound - totalOutbound;

  const averageDailyConsumption = totalOutbound / period;
  const stockTurnover = calculateStockTurnover(totalOutbound, totalInbound);

  // Get current stock levels
  const currentStock = await prisma.stock.findMany({
    where: {
      itemId,
      ...(warehouseId && { warehouseId })
    },
    include: {
      warehouse: {
        select: { id: true, name: true, code: true }
      }
    }
  });

  const totalCurrentStock = currentStock.reduce((sum, stock) => sum + parseFloat(stock.quantity), 0);
  const daysOfInventory = calculateDaysOfInventory(totalCurrentStock, averageDailyConsumption);

  return {
    item,
    period,
    summary: {
      totalInbound,
      totalOutbound,
      netMovement,
      averageDailyConsumption,
      stockTurnover,
      daysOfInventory,
      currentStock: totalCurrentStock
    },
    movements: {
      inbound: inboundMovements.length,
      outbound: outboundMovements.length,
      total: movements.length
    },
    stockLevels: currentStock.map(stock => ({
      warehouseId: stock.warehouse.id,
      warehouseName: stock.warehouse.name,
      warehouseCode: stock.warehouse.code,
      quantity: parseFloat(stock.quantity),
      reserved: parseFloat(stock.reserved),
      available: calculateAvailableStock(stock.quantity, stock.reserved)
    }))
  };
}

module.exports = {
  getStockOverview,
  getItemStockLevels,
  transferStock,
  reserveStock,
  releaseStock,
  adjustStock,
  getStockMovements,
  getStockAnalytics
};
