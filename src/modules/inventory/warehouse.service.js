const { prisma } = require('../../config/db');
const { ValidationError, NotFoundError } = require('../../core/exceptions');
const { calculateAvailableStock } = require('../../core/utils/stockFormulas');
const { TransactionType, MovementType } = require('../../core/constants');

async function getWarehouseInventory(warehouseId, tenantId, filters = {}) {
  const { itemType, lowStockOnly = false, includeInactive = false } = filters;

  const warehouse = await prisma.warehouse.findFirst({
    where: { id: warehouseId, tenantId },
    select: {
      id: true,
      name: true,
      code: true,
      location: true,
      createdAt: true
    }
  });

  if (!warehouse) {
    throw new NotFoundError('Warehouse not found');
  }

  const where = {
    warehouseId,
    item: {
      tenantId,
      ...(itemType && { type: itemType }),
      ...(includeInactive ? {} : { isActive: true })
    }
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
          unit: true,
          isActive: true
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
      isLow: parseFloat(stock.quantity) <= 10, // Simplified threshold
      recentMovements: stock.movements.map(movement => ({
        id: movement.id,
        type: movement.type,
        quantity: parseFloat(movement.quantity),
        reference: movement.reference,
        createdAt: movement.createdAt
      }))
    };
  });

  // Apply low stock filter
  let filteredStock = stockMetrics;
  if (lowStockOnly) {
    filteredStock = stockMetrics.filter(stock => stock.isLow);
  }

  // Calculate summary statistics
  const summary = {
    warehouse,
    totalItems: filteredStock.length,
    totalQuantity: filteredStock.reduce((sum, stock) => sum + parseFloat(stock.quantity), 0),
    totalReserved: filteredStock.reduce((sum, stock) => sum + parseFloat(stock.reserved), 0),
    totalAvailable: filteredStock.reduce((sum, stock) => sum + stock.available, 0),
    totalValue: filteredStock.reduce((sum, stock) => sum + stock.totalValue, 0),
    availableValue: filteredStock.reduce((sum, stock) => sum + stock.availableValue, 0),
    lowStockItems: filteredStock.filter(stock => stock.isLow).length,
    activeItems: filteredStock.filter(stock => stock.item.isActive).length,
    inactiveItems: filteredStock.filter(stock => !stock.item.isActive).length
  };

  return {
    summary,
    stock: filteredStock
  };
}

async function getWarehouseCapacityUtilization(warehouseId, tenantId) {
  const warehouse = await prisma.warehouse.findFirst({
    where: { id: warehouseId, tenantId },
    select: { id: true, name: true, code: true }
  });

  if (!warehouse) {
    throw new NotFoundError('Warehouse not found');
  }

  // Get all stock in warehouse
  const stockRecords = await prisma.stock.findMany({
    where: { warehouseId },
    include: {
      item: {
        select: {
          id: true,
          name: true,
          sku: true,
          type: true,
          unit: true
        }
      }
    }
  });

  // Group by item type for analysis
  const typeGroups = stockRecords.reduce((groups, stock) => {
    const type = stock.item.type;
    if (!groups[type]) {
      groups[type] = {
        items: [],
        totalQuantity: 0,
        totalValue: 0
      };
    }
    
    groups[type].items.push({
      itemId: stock.item.id,
      itemName: stock.item.name,
      sku: stock.item.sku,
      quantity: parseFloat(stock.quantity),
      reserved: parseFloat(stock.reserved),
      available: calculateAvailableStock(stock.quantity, stock.reserved)
    });
    
    groups[type].totalQuantity += parseFloat(stock.quantity);
    return groups;
  }, {});

  // Calculate overall metrics
  const totalItems = stockRecords.length;
  const totalQuantity = stockRecords.reduce((sum, stock) => sum + parseFloat(stock.quantity), 0);
  const totalReserved = stockRecords.reduce((sum, stock) => sum + parseFloat(stock.reserved), 0);
  const totalAvailable = stockRecords.reduce((sum, stock) => 
    sum + calculateAvailableStock(stock.quantity, stock.reserved), 0
  );

  return {
    warehouse,
    summary: {
      totalItems,
      totalQuantity,
      totalReserved,
      totalAvailable,
      utilizationRate: totalItems > 0 ? (totalAvailable / totalQuantity) * 100 : 0
    },
    byType: typeGroups
  };
}

async function getWarehouseMovements(warehouseId, tenantId, filters = {}) {
  const {
    movementType,
    itemType,
    startDate,
    endDate,
    page = 1,
    limit = 20
  } = filters;

  const warehouse = await prisma.warehouse.findFirst({
    where: { id: warehouseId, tenantId },
    select: { id: true, name: true, code: true }
  });

  if (!warehouse) {
    throw new NotFoundError('Warehouse not found');
  }

  const skip = (page - 1) * limit;

  const where = {
    stock: {
      warehouseId,
      ...(itemType && {
        item: { type: itemType }
      })
    },
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
              select: {
                id: true,
                name: true,
                sku: true,
                type: true,
                unit: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.stockMovement.count({ where })
  ]);

  // Calculate movement summary
  const inboundMovements = movements.filter(m => m.type === MovementType.IN);
  const outboundMovements = movements.filter(m => m.type === MovementType.OUT);

  const summary = {
    totalMovements: movements.length,
    inboundMovements: inboundMovements.length,
    outboundMovements: outboundMovements.length,
    totalInboundQuantity: inboundMovements.reduce((sum, m) => sum + parseFloat(m.quantity), 0),
    totalOutboundQuantity: outboundMovements.reduce((sum, m) => sum + parseFloat(m.quantity), 0),
    netMovement: inboundMovements.reduce((sum, m) => sum + parseFloat(m.quantity), 0) - 
                 outboundMovements.reduce((sum, m) => sum + parseFloat(m.quantity), 0)
  };

  return {
    warehouse,
    summary,
    movements: movements.map(movement => ({
      id: movement.id,
      type: movement.type,
      quantity: parseFloat(movement.quantity),
      reference: movement.reference,
      createdAt: movement.createdAt,
      createdBy: movement.createdBy,
      item: movement.stock.item
    })),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}

async function bulkStockAdjustment(warehouseId, tenantId, adjustments, createdById) {
  const warehouse = await prisma.warehouse.findFirst({
    where: { id: warehouseId, tenantId },
    select: { id: true, name: true }
  });

  if (!warehouse) {
    throw new NotFoundError('Warehouse not found');
  }

  if (!adjustments || adjustments.length === 0) {
    throw new ValidationError('Adjustments array is required');
  }

  const results = [];
  const errors = [];

  // Process each adjustment
  for (const adjustment of adjustments) {
    try {
      const { itemId, quantity, adjustmentType, note } = adjustment;

      if (!itemId || !quantity || !adjustmentType) {
        errors.push({
          itemId,
          error: 'Item ID, quantity, and adjustment type are required'
        });
        continue;
      }

      const adjustQty = parseFloat(quantity);
      if (adjustQty <= 0) {
        errors.push({
          itemId,
          error: 'Adjustment quantity must be positive'
        });
        continue;
      }

      if (!['INCREASE', 'DECREASE'].includes(adjustmentType)) {
        errors.push({
          itemId,
          error: 'Adjustment type must be INCREASE or DECREASE'
        });
        continue;
      }

      // Get or create stock record
      let stock = await prisma.stock.findUnique({
        where: {
          warehouseId_itemId: {
            warehouseId,
            itemId
          }
        }
      });

      if (!stock) {
        stock = await prisma.stock.create({
          data: {
            warehouseId,
            itemId,
            quantity: 0,
            reserved: 0
          }
        });
      }

      const currentQty = parseFloat(stock.quantity);
      const newQty = adjustmentType === 'INCREASE' 
        ? currentQty + adjustQty 
        : currentQty - adjustQty;

      if (newQty < 0) {
        errors.push({
          itemId,
          error: 'Stock adjustment would result in negative quantity'
        });
        continue;
      }

      // Perform adjustment in transaction
      const result = await prisma.$transaction(async (tx) => {
        // Update stock
        const updatedStock = await tx.stock.update({
          where: { id: stock.id },
          data: { quantity: newQty }
        });

        // Create transaction
        const transaction = await tx.inventoryTransaction.create({
          data: {
            type: TransactionType.ADJUSTMENT,
            itemId,
            warehouseId,
            stockId: stock.id,
            quantity: adjustQty,
            reference: `BULK-ADJUST-${Date.now()}`,
            createdById,
            note: note || `Bulk ${adjustmentType.toLowerCase()} - ${adjustQty} units`
          }
        });

        // Create stock movement
        await tx.stockMovement.create({
          data: {
            stockId: stock.id,
            type: adjustmentType === 'INCREASE' ? MovementType.IN : MovementType.OUT,
            quantity: adjustQty,
            reference: `BULK-ADJUST-${Date.now()}`,
            createdBy: createdById
          }
        });

        return {
          itemId,
          adjustmentType,
          quantity: adjustQty,
          previousQuantity: currentQty,
          newQuantity: newQty,
          transactionId: transaction.id
        };
      });

      results.push(result);

    } catch (error) {
      errors.push({
        itemId: adjustment.itemId,
        error: error.message
      });
    }
  }

  return {
    warehouse,
    successful: results,
    errors,
    summary: {
      totalProcessed: adjustments.length,
      successful: results.length,
      failed: errors.length
    }
  };
}

async function getWarehousePerformance(warehouseId, tenantId, options = {}) {
  const { period = 30 } = options;

  const warehouse = await prisma.warehouse.findFirst({
    where: { id: warehouseId, tenantId },
    select: { id: true, name: true, code: true }
  });

  if (!warehouse) {
    throw new NotFoundError('Warehouse not found');
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);

  // Get movement data for the period
  const movements = await prisma.stockMovement.findMany({
    where: {
      stock: { warehouseId },
      createdAt: { gte: startDate }
    },
    include: {
      stock: {
        include: {
          item: {
            select: {
              id: true,
              name: true,
              sku: true,
              type: true,
              cost: true
            }
          }
        }
      }
    },
    orderBy: { createdAt: 'asc' }
  });

  // Calculate performance metrics
  const inboundMovements = movements.filter(m => m.type === MovementType.IN);
  const outboundMovements = movements.filter(m => m.type === MovementType.OUT);

  const totalInbound = inboundMovements.reduce((sum, m) => sum + parseFloat(m.quantity), 0);
  const totalOutbound = outboundMovements.reduce((sum, m) => sum + parseFloat(m.quantity), 0);
  const netMovement = totalInbound - totalOutbound;

  // Calculate turnover by item type
  const turnoverByType = movements.reduce((acc, movement) => {
    const type = movement.stock.item.type;
    if (!acc[type]) {
      acc[type] = {
        inbound: 0,
        outbound: 0,
        items: new Set()
      };
    }
    
    if (movement.type === MovementType.IN) {
      acc[type].inbound += parseFloat(movement.quantity);
    } else {
      acc[type].outbound += parseFloat(movement.quantity);
    }
    
    acc[type].items.add(movement.stock.item.id);
    return acc;
  }, {});

  // Convert Set to count
  Object.keys(turnoverByType).forEach(type => {
    turnoverByType[type].uniqueItems = turnoverByType[type].items.size;
    delete turnoverByType[type].items;
  });

  // Get current stock levels
  const currentStock = await prisma.stock.findMany({
    where: { warehouseId },
    include: {
      item: {
        select: {
          id: true,
          type: true,
          cost: true
        }
      }
    }
  });

  const currentValue = currentStock.reduce((sum, stock) => 
    sum + (parseFloat(stock.quantity) * parseFloat(stock.item.cost)), 0
  );

  return {
    warehouse,
    period,
    summary: {
      totalMovements: movements.length,
      inboundMovements: inboundMovements.length,
      outboundMovements: outboundMovements.length,
      totalInbound,
      totalOutbound,
      netMovement,
      currentValue,
      averageDailyMovement: movements.length / period
    },
    turnoverByType,
    trends: {
      dailyMovements: movements.reduce((acc, movement) => {
        const date = movement.createdAt.toISOString().split('T')[0];
        if (!acc[date]) {
          acc[date] = { inbound: 0, outbound: 0 };
        }
        if (movement.type === MovementType.IN) {
          acc[date].inbound += parseFloat(movement.quantity);
        } else {
          acc[date].outbound += parseFloat(movement.quantity);
        }
        return acc;
      }, {})
    }
  };
}

module.exports = {
  getWarehouseInventory,
  getWarehouseCapacityUtilization,
  getWarehouseMovements,
  bulkStockAdjustment,
  getWarehousePerformance
};
