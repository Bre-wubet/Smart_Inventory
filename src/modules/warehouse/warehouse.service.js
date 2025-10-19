const { prisma } = require('../../config/db');
const { ValidationError, NotFoundError } = require('../../core/exceptions');
const { TransactionType, MovementType, AlertType } = require('../../core/constants');
const inventoryTransactionService = require('../../core/services/inventoryTransaction.service');
const { calculateAvailableStock, calculateStockTurnover, calculateDaysOfInventory } = require('../../core/utils/stockFormulas');

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

// Enhanced warehouse analytics and management functions
async function getWarehouseAnalytics(tenantId, options = {}) {
  const { 
    startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
    endDate = new Date(),
    warehouseId
  } = options;

  const where = {
    tenantId,
    ...(warehouseId && { id: warehouseId })
  };

  const warehouses = await prisma.warehouse.findMany({
    where,
    include: {
      stock: {
        include: {
          item: {
            select: { id: true, name: true, sku: true, type: true, cost: true, price: true }
          }
        }
      },
      transactions: {
        where: {
          createdAt: { gte: startDate, lte: endDate }
        },
        include: {
          item: {
            select: { id: true, name: true, sku: true, cost: true }
          }
        }
      }
    }
  });

  const analytics = warehouses.map(warehouse => {
    const totalItems = warehouse.stock.length;
    const totalQuantity = warehouse.stock.reduce((sum, stock) => sum + parseFloat(stock.quantity), 0);
    const totalReserved = warehouse.stock.reduce((sum, stock) => sum + parseFloat(stock.reserved), 0);
    const totalAvailable = totalQuantity - totalReserved;
    const totalValue = warehouse.stock.reduce((sum, stock) => 
      sum + (parseFloat(stock.quantity) * parseFloat(stock.item.cost || 0)), 0
    );

    // Calculate movement metrics
    const inboundTransactions = warehouse.transactions.filter(t => 
      ['PURCHASE', 'TRANSFER'].includes(t.type) && parseFloat(t.quantity) > 0
    );
    const outboundTransactions = warehouse.transactions.filter(t => 
      ['SALE', 'USAGE', 'TRANSFER'].includes(t.type) && parseFloat(t.quantity) < 0
    );

    const totalInbound = inboundTransactions.reduce((sum, t) => sum + Math.abs(parseFloat(t.quantity)), 0);
    const totalOutbound = outboundTransactions.reduce((sum, t) => sum + Math.abs(parseFloat(t.quantity)), 0);
    const netMovement = totalInbound - totalOutbound;

    // Calculate turnover
    const averageInventoryValue = totalValue / 2; // Simplified calculation
    const stockTurnover = calculateStockTurnover(totalOutbound, averageInventoryValue);

    return {
      warehouse: {
        id: warehouse.id,
        name: warehouse.name,
        code: warehouse.code,
        location: warehouse.location
      },
      metrics: {
        totalItems,
        totalQuantity,
        totalReserved,
        totalAvailable,
        totalValue,
        totalInbound,
        totalOutbound,
        netMovement,
        stockTurnover,
        averageDailyMovement: (totalInbound + totalOutbound) / Math.max(1, Math.ceil((endDate - startDate) / (24 * 60 * 60 * 1000))),
        utilizationRate: totalAvailable / Math.max(1, totalQuantity) * 100
      }
    };
  });

  return {
    analytics,
    summary: {
      totalWarehouses: warehouses.length,
      totalItems: analytics.reduce((sum, w) => sum + w.metrics.totalItems, 0),
      totalValue: analytics.reduce((sum, w) => sum + w.metrics.totalValue, 0),
      averageUtilization: analytics.length > 0 
        ? analytics.reduce((sum, w) => sum + w.metrics.utilizationRate, 0) / analytics.length 
        : 0
    },
    period: { startDate, endDate }
  };
}

async function getWarehousePerformanceMetrics(warehouseId, tenantId, options = {}) {
  const { period = 30 } = options;

  const warehouse = await prisma.warehouse.findFirst({
    where: { id: warehouseId, tenantId },
    include: {
      stock: {
        include: {
          item: {
            select: { id: true, name: true, sku: true, cost: true, type: true }
          }
        }
      }
    }
  });

  if (!warehouse) {
    throw new NotFoundError('Warehouse not found');
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);

  // Get transaction data for the period
  const transactions = await prisma.inventoryTransaction.findMany({
    where: {
      warehouseId,
      createdAt: { gte: startDate }
    },
    include: {
      item: {
        select: { id: true, name: true, sku: true, cost: true }
      }
    },
    orderBy: { createdAt: 'asc' }
  });

  // Calculate performance metrics
  const inboundMovements = transactions.filter(t => 
    ['PURCHASE', 'TRANSFER'].includes(t.type) && parseFloat(t.quantity) > 0
  );
  const outboundMovements = transactions.filter(t => 
    ['SALE', 'USAGE', 'TRANSFER'].includes(t.type) && parseFloat(t.quantity) < 0
  );

  const totalInbound = inboundMovements.reduce((sum, t) => sum + Math.abs(parseFloat(t.quantity)), 0);
  const totalOutbound = outboundMovements.reduce((sum, t) => sum + Math.abs(parseFloat(t.quantity)), 0);

  // Calculate efficiency metrics
  const stockByType = warehouse.stock.reduce((acc, stock) => {
    const type = stock.item.type;
    if (!acc[type]) {
      acc[type] = { quantity: 0, value: 0, items: 0 };
    }
    acc[type].quantity += parseFloat(stock.quantity);
    acc[type].value += parseFloat(stock.quantity) * parseFloat(stock.item.cost || 0);
    acc[type].items += 1;
    return acc;
  }, {});

  const totalValue = warehouse.stock.reduce((sum, stock) => 
    sum + (parseFloat(stock.quantity) * parseFloat(stock.item.cost || 0)), 0
  );

  const averageDailyConsumption = totalOutbound / period;
  const daysOfInventory = calculateDaysOfInventory(
    warehouse.stock.reduce((sum, stock) => sum + parseFloat(stock.quantity), 0),
    averageDailyConsumption
  );

  return {
    warehouse: {
      id: warehouse.id,
      name: warehouse.name,
      code: warehouse.code,
      location: warehouse.location
    },
    performance: {
      period,
      totalInbound,
      totalOutbound,
      netMovement: totalInbound - totalOutbound,
      averageDailyConsumption,
      daysOfInventory,
      totalValue,
      stockByType,
      efficiency: {
        inboundTransactions: inboundMovements.length,
        outboundTransactions: outboundMovements.length,
        averageTransactionValue: transactions.length > 0 
          ? transactions.reduce((sum, t) => sum + Math.abs(parseFloat(t.quantity) * parseFloat(t.item.cost || 0)), 0) / transactions.length 
          : 0
      }
    }
  };
}

async function getWarehouseCapacityAnalysis(tenantId, options = {}) {
  const { warehouseId } = options;

  const where = {
    tenantId,
    ...(warehouseId && { id: warehouseId })
  };

  const warehouses = await prisma.warehouse.findMany({
    where,
    include: {
      stock: {
        include: {
          item: {
            select: { id: true, name: true, sku: true, type: true, cost: true }
          }
        }
      }
    }
  });

  const capacityAnalysis = warehouses.map(warehouse => {
    const totalItems = warehouse.stock.length;
    const totalQuantity = warehouse.stock.reduce((sum, stock) => sum + parseFloat(stock.quantity), 0);
    const totalReserved = warehouse.stock.reduce((sum, stock) => sum + parseFloat(stock.reserved), 0);
    const totalAvailable = totalQuantity - totalReserved;
    const totalValue = warehouse.stock.reduce((sum, stock) => 
      sum + (parseFloat(stock.quantity) * parseFloat(stock.item.cost || 0)), 0
    );

    // Calculate capacity metrics (simplified - in production you'd have actual capacity data)
    const estimatedCapacity = totalQuantity * 1.5; // Assume 150% of current stock as capacity
    const utilizationPercentage = (totalQuantity / estimatedCapacity) * 100;
    const availableCapacity = estimatedCapacity - totalQuantity;

    // Identify space constraints
    const spaceConstraints = [];
    if (utilizationPercentage > 80) {
      spaceConstraints.push('High utilization - consider expansion');
    }
    if (totalReserved > totalAvailable * 0.8) {
      spaceConstraints.push('High reservation rate - limited available space');
    }

    return {
      warehouse: {
        id: warehouse.id,
        name: warehouse.name,
        code: warehouse.code,
        location: warehouse.location
      },
      capacity: {
        totalItems,
        totalQuantity,
        totalReserved,
        totalAvailable,
        totalValue,
        estimatedCapacity,
        utilizationPercentage: Math.round(utilizationPercentage * 100) / 100,
        availableCapacity,
        spaceConstraints
      }
    };
  });

  return {
    analysis: capacityAnalysis,
    summary: {
      totalWarehouses: warehouses.length,
      averageUtilization: capacityAnalysis.length > 0 
        ? capacityAnalysis.reduce((sum, w) => sum + w.capacity.utilizationPercentage, 0) / capacityAnalysis.length 
        : 0,
      warehousesWithConstraints: capacityAnalysis.filter(w => w.capacity.spaceConstraints.length > 0).length
    }
  };
}

async function optimizeWarehouseInventory(tenantId, options = {}) {
  const { 
    warehouseId, 
    optimizationType = 'BALANCE',
    targetUtilization = 70,
    excludeItems = []
  } = options;

  const warehouses = await prisma.warehouse.findMany({
    where: {
      tenantId,
      ...(warehouseId && { id: warehouseId })
    },
    include: {
      stock: {
        include: {
          item: {
            select: { id: true, name: true, sku: true, type: true, cost: true }
          }
        }
      }
    }
  });

  const recommendations = [];

  for (const warehouse of warehouses) {
    const stockItems = warehouse.stock.filter(stock => !excludeItems.includes(stock.itemId));
    
    // Calculate current metrics
    const totalQuantity = stockItems.reduce((sum, stock) => sum + parseFloat(stock.quantity), 0);
    const totalValue = stockItems.reduce((sum, stock) => 
      sum + (parseFloat(stock.quantity) * parseFloat(stock.item.cost || 0)), 0
    );

    // Identify optimization opportunities
    const lowStockItems = stockItems.filter(stock => parseFloat(stock.quantity) < 10);
    const overstockItems = stockItems.filter(stock => parseFloat(stock.quantity) > 100);
    const highValueItems = stockItems.filter(stock => 
      parseFloat(stock.quantity) * parseFloat(stock.item.cost || 0) > totalValue * 0.1
    );

    // Generate recommendations based on optimization type
    switch (optimizationType) {
      case 'BALANCE':
        if (lowStockItems.length > 0) {
          recommendations.push({
            warehouse: warehouse.name,
            type: 'REPLENISH',
            priority: 'HIGH',
            items: lowStockItems.map(stock => ({
              item: stock.item,
              currentQuantity: parseFloat(stock.quantity),
              recommendedAction: 'Increase stock level',
              suggestedQuantity: 50 // Simplified
            })),
            description: `${lowStockItems.length} items need replenishment`
          });
        }

        if (overstockItems.length > 0) {
          recommendations.push({
            warehouse: warehouse.name,
            type: 'REDUCE',
            priority: 'MEDIUM',
            items: overstockItems.map(stock => ({
              item: stock.item,
              currentQuantity: parseFloat(stock.quantity),
              recommendedAction: 'Reduce stock level',
              suggestedQuantity: 50 // Simplified
            })),
            description: `${overstockItems.length} items are overstocked`
          });
        }
        break;

      case 'VALUE_OPTIMIZATION':
        highValueItems.forEach(stock => {
          recommendations.push({
            warehouse: warehouse.name,
            type: 'VALUE_REVIEW',
            priority: 'HIGH',
            items: [{
              item: stock.item,
              currentQuantity: parseFloat(stock.quantity),
              currentValue: parseFloat(stock.quantity) * parseFloat(stock.item.cost || 0),
              recommendedAction: 'Review high-value item positioning'
            }],
            description: `High-value item ${stock.item.name} needs review`
          });
        });
        break;
    }
  }

  return {
    recommendations,
    summary: {
      totalRecommendations: recommendations.length,
      byType: recommendations.reduce((acc, rec) => {
        acc[rec.type] = (acc[rec.type] || 0) + 1;
        return acc;
      }, {}),
      byPriority: recommendations.reduce((acc, rec) => {
        acc[rec.priority] = (acc[rec.priority] || 0) + 1;
        return acc;
      }, {})
    }
  };
}

async function getWarehouseMovementAnalytics(tenantId, options = {}) {
  const { 
    warehouseId,
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    endDate = new Date(),
    groupBy = 'day'
  } = options;

  const where = {
    warehouse: { tenantId },
    createdAt: { gte: startDate, lte: endDate },
    ...(warehouseId && { warehouseId })
  };

  const movements = await prisma.stockMovement.findMany({
    where,
    include: {
      stock: {
        include: {
          item: {
            select: { id: true, name: true, sku: true, type: true }
          },
          warehouse: {
            select: { id: true, name: true, code: true }
          }
        }
      }
    },
    orderBy: { createdAt: 'asc' }
  });

  // Group movements by time period
  const groupedMovements = {};
  movements.forEach(movement => {
    let groupKey;
    const date = new Date(movement.createdAt);
    
    switch (groupBy) {
      case 'hour':
        groupKey = date.toISOString().slice(0, 13);
        break;
      case 'day':
        groupKey = date.toISOString().slice(0, 10);
        break;
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        groupKey = weekStart.toISOString().slice(0, 10);
        break;
      case 'month':
        groupKey = date.toISOString().slice(0, 7);
        break;
      default:
        groupKey = date.toISOString().slice(0, 10);
    }

    if (!groupedMovements[groupKey]) {
      groupedMovements[groupKey] = {
        period: groupKey,
        inbound: 0,
        outbound: 0,
        netMovement: 0,
        transactions: 0,
        items: new Set()
      };
    }

    const quantity = parseFloat(movement.quantity);
    if (movement.type === MovementType.IN) {
      groupedMovements[groupKey].inbound += quantity;
    } else {
      groupedMovements[groupKey].outbound += quantity;
    }
    groupedMovements[groupKey].netMovement = groupedMovements[groupKey].inbound - groupedMovements[groupKey].outbound;
    groupedMovements[groupKey].transactions += 1;
    groupedMovements[groupKey].items.add(movement.stock.itemId);
  });

  // Convert to array and add item counts
  const analytics = Object.values(groupedMovements).map(group => ({
    ...group,
    uniqueItems: group.items.size
  }));

  // Calculate summary statistics
  const summary = {
    totalMovements: movements.length,
    totalInbound: movements.filter(m => m.type === MovementType.IN).reduce((sum, m) => sum + parseFloat(m.quantity), 0),
    totalOutbound: movements.filter(m => m.type === MovementType.OUT).reduce((sum, m) => sum + parseFloat(m.quantity), 0),
    netMovement: movements.reduce((sum, m) => {
      const qty = parseFloat(m.quantity);
      return sum + (m.type === MovementType.IN ? qty : -qty);
    }, 0),
    averageDailyMovement: analytics.length > 0 
      ? analytics.reduce((sum, a) => sum + a.inbound + a.outbound, 0) / analytics.length 
      : 0
  };

  return {
    analytics,
    summary,
    period: { startDate, endDate },
    groupBy
  };
}

async function getWarehouseCostAnalysis(tenantId, options = {}) {
  const { 
    warehouseId,
    startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    endDate = new Date()
  } = options;

  const where = {
    warehouse: { tenantId },
    createdAt: { gte: startDate, lte: endDate },
    ...(warehouseId && { warehouseId })
  };

  const warehouses = await prisma.warehouse.findMany({
    where: { tenantId, ...(warehouseId && { id: warehouseId }) },
    include: {
      stock: {
        include: {
          item: {
            select: { id: true, name: true, sku: true, cost: true, type: true }
          }
        }
      },
      transactions: {
        where: {
          createdAt: { gte: startDate, lte: endDate }
        },
        include: {
          item: {
            select: { id: true, name: true, cost: true }
          }
        }
      }
    }
  });

  const costAnalysis = warehouses.map(warehouse => {
    // Calculate holding costs
    const totalInventoryValue = warehouse.stock.reduce((sum, stock) => 
      sum + (parseFloat(stock.quantity) * parseFloat(stock.item.cost || 0)), 0
    );

    // Calculate transaction costs (simplified)
    const transactionCount = warehouse.transactions.length;
    const estimatedTransactionCost = transactionCount * 10; // $10 per transaction

    // Calculate opportunity cost (simplified)
    const opportunityCostRate = 0.1; // 10% annual opportunity cost
    const holdingPeriodDays = Math.ceil((endDate - startDate) / (24 * 60 * 60 * 1000));
    const opportunityCost = totalInventoryValue * opportunityCostRate * (holdingPeriodDays / 365);

    // Calculate cost per item
    const totalItems = warehouse.stock.length;
    const costPerItem = totalItems > 0 ? (estimatedTransactionCost + opportunityCost) / totalItems : 0;

    return {
      warehouse: {
        id: warehouse.id,
        name: warehouse.name,
        code: warehouse.code,
        location: warehouse.location
      },
      costs: {
        totalInventoryValue,
        estimatedTransactionCost,
        opportunityCost,
        totalHoldingCost: estimatedTransactionCost + opportunityCost,
        costPerItem,
        transactionCount,
        averageInventoryValue: totalInventoryValue / Math.max(1, holdingPeriodDays)
      }
    };
  });

  return {
    analysis: costAnalysis,
    summary: {
      totalWarehouses: warehouses.length,
      totalInventoryValue: costAnalysis.reduce((sum, w) => sum + w.costs.totalInventoryValue, 0),
      totalHoldingCost: costAnalysis.reduce((sum, w) => sum + w.costs.totalHoldingCost, 0),
      averageCostPerItem: costAnalysis.length > 0 
        ? costAnalysis.reduce((sum, w) => sum + w.costs.costPerItem, 0) / costAnalysis.length 
        : 0
    },
    period: { startDate, endDate }
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
  adjustStock,
  getWarehouseAnalytics,
  getWarehousePerformanceMetrics,
  getWarehouseCapacityAnalysis,
  optimizeWarehouseInventory,
  getWarehouseMovementAnalytics,
  getWarehouseCostAnalysis
};
