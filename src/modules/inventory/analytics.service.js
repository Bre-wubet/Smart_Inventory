const { prisma } = require('../../config/db');
const { ValidationError, NotFoundError } = require('../../core/exceptions');
const { 
  calculateStockTurnover,
  calculateDaysOfInventory,
  calculateEOQ,
  calculateSafetyStock
} = require('../../core/utils/stockFormulas');
const { calculateWeightedAverageCost } = require('../../core/utils/costCalculation');
const { TransactionType, ProductType } = require('../../core/constants');

async function getInventoryDashboard(tenantId, options = {}) {
  const { period = 30, warehouseId } = options;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);

  // Get all stock records
  const stockRecords = await prisma.stock.findMany({
    where: {
      item: { tenantId },
      ...(warehouseId && { warehouseId })
    },
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
          code: true
        }
      }
    }
  });

  // Get transaction data for the period
  const transactions = await prisma.inventoryTransaction.findMany({
    where: {
      item: { tenantId },
      createdAt: { gte: startDate },
      ...(warehouseId && { warehouseId })
    },
    include: {
      item: {
        select: { id: true, name: true, sku: true, type: true }
      },
      warehouse: {
        select: { id: true, name: true, code: true }
      }
    }
  });

  // Calculate key metrics
  const totalItems = stockRecords.length;
  const totalValue = stockRecords.reduce((sum, stock) => 
    sum + (parseFloat(stock.quantity) * parseFloat(stock.item.cost)), 0
  );
  const totalQuantity = stockRecords.reduce((sum, stock) => 
    sum + parseFloat(stock.quantity), 0
  );

  // Group by item type
  const byType = stockRecords.reduce((acc, stock) => {
    const type = stock.item.type;
    if (!acc[type]) {
      acc[type] = {
        items: 0,
        quantity: 0,
        value: 0,
        averageCost: 0
      };
    }
    acc[type].items++;
    acc[type].quantity += parseFloat(stock.quantity);
    acc[type].value += parseFloat(stock.quantity) * parseFloat(stock.item.cost);
    return acc;
  }, {});

  // Calculate average costs
  Object.keys(byType).forEach(type => {
    if (byType[type].quantity > 0) {
      byType[type].averageCost = byType[type].value / byType[type].quantity;
    }
  });

  // Group by warehouse
  const byWarehouse = stockRecords.reduce((acc, stock) => {
    const warehouseName = stock.warehouse.name;
    if (!acc[warehouseName]) {
      acc[warehouseName] = {
        items: 0,
        quantity: 0,
        value: 0,
        code: stock.warehouse.code
      };
    }
    acc[warehouseName].items++;
    acc[warehouseName].quantity += parseFloat(stock.quantity);
    acc[warehouseName].value += parseFloat(stock.quantity) * parseFloat(stock.item.cost);
    return acc;
  }, {});

  // Calculate movement trends
  const dailyMovements = transactions.reduce((acc, transaction) => {
    const date = transaction.createdAt.toISOString().split('T')[0];
    if (!acc[date]) {
      acc[date] = { inbound: 0, outbound: 0, transactions: 0 };
    }
    
    if (['PURCHASE', 'TRANSFER'].includes(transaction.type)) {
      acc[date].inbound += parseFloat(transaction.quantity);
    } else if (['SALE', 'USAGE'].includes(transaction.type)) {
      acc[date].outbound += parseFloat(transaction.quantity);
    }
    
    acc[date].transactions++;
    return acc;
  }, {});

  // Calculate top moving items
  const itemMovements = transactions.reduce((acc, transaction) => {
    const itemId = transaction.item.id;
    if (!acc[itemId]) {
      acc[itemId] = {
        item: transaction.item,
        inbound: 0,
        outbound: 0,
        transactions: 0
      };
    }
    
    if (['PURCHASE', 'TRANSFER'].includes(transaction.type)) {
      acc[itemId].inbound += parseFloat(transaction.quantity);
    } else if (['SALE', 'USAGE'].includes(transaction.type)) {
      acc[itemId].outbound += parseFloat(transaction.quantity);
    }
    
    acc[itemId].transactions++;
    return acc;
  }, {});

  const topMovingItems = Object.values(itemMovements)
    .sort((a, b) => (a.inbound + a.outbound) - (b.inbound + b.outbound))
    .slice(-10)
    .reverse();

  return {
    period,
    summary: {
      totalItems,
      totalValue,
      totalQuantity,
      averageValuePerItem: totalItems > 0 ? totalValue / totalItems : 0
    },
    byType,
    byWarehouse,
    trends: {
      dailyMovements
    },
    topMovingItems
  };
}

async function getInventoryValuation(tenantId, options = {}) {
  const { 
    warehouseId, 
    itemType, 
    valuationMethod = 'WEIGHTED_AVERAGE',
    asOfDate = new Date()
  } = options;

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
          code: true
        }
      }
    }
  });

  // Calculate valuations using different methods
  const valuations = stockRecords.map(stock => {
    const quantity = parseFloat(stock.quantity);
    const reserved = parseFloat(stock.reserved);
    const available = quantity - reserved;

    // Different valuation methods
    const fifoValue = quantity * parseFloat(stock.item.cost); // Simplified FIFO
    const lifoValue = quantity * parseFloat(stock.item.cost); // Simplified LIFO
    const weightedAverageValue = quantity * parseFloat(stock.item.cost); // Simplified WAC
    const marketValue = quantity * parseFloat(stock.item.price);

    return {
      item: stock.item,
      warehouse: stock.warehouse,
      quantity,
      reserved,
      available,
      valuations: {
        fifo: fifoValue,
        lifo: lifoValue,
        weightedAverage: weightedAverageValue,
        market: marketValue,
        cost: parseFloat(stock.item.cost),
        price: parseFloat(stock.item.price)
      }
    };
  });

  // Calculate totals by valuation method
  const totals = {
    fifo: valuations.reduce((sum, v) => sum + v.valuations.fifo, 0),
    lifo: valuations.reduce((sum, v) => sum + v.valuations.lifo, 0),
    weightedAverage: valuations.reduce((sum, v) => sum + v.valuations.weightedAverage, 0),
    market: valuations.reduce((sum, v) => sum + v.valuations.market, 0)
  };

  // Group by item type
  const byType = valuations.reduce((acc, valuation) => {
    const type = valuation.item.type;
    if (!acc[type]) {
      acc[type] = {
        items: 0,
        quantity: 0,
        fifoValue: 0,
        marketValue: 0
      };
    }
    acc[type].items++;
    acc[type].quantity += valuation.quantity;
    acc[type].fifoValue += valuation.valuations.fifo;
    acc[type].marketValue += valuation.valuations.market;
    return acc;
  }, {});

  return {
    asOfDate,
    valuationMethod,
    totals,
    byType,
    items: valuations
  };
}

async function getStockTurnoverAnalysis(tenantId, options = {}) {
  const { period = 365, warehouseId, itemType } = options;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);

  // Get all items with their transactions
  const items = await prisma.item.findMany({
    where: {
      tenantId,
      ...(itemType && { type: itemType })
    },
    include: {
      stock: {
        where: warehouseId ? { warehouseId } : {},
        include: {
          warehouse: {
            select: { id: true, name: true, code: true }
          }
        }
      },
      transactions: {
        where: {
          createdAt: { gte: startDate },
          ...(warehouseId && { warehouseId })
        }
      }
    }
  });

  const turnoverAnalysis = items.map(item => {
    const totalStock = item.stock.reduce((sum, stock) => sum + parseFloat(stock.quantity), 0);
    const totalReserved = item.stock.reduce((sum, stock) => sum + parseFloat(stock.reserved), 0);
    const availableStock = totalStock - totalReserved;

    // Calculate COGS (Cost of Goods Sold) from sale transactions
    const saleTransactions = item.transactions.filter(t => t.type === TransactionType.SALE);
    const cogs = saleTransactions.reduce((sum, t) => 
      sum + (parseFloat(t.quantity) * parseFloat(t.costPerUnit || 0)), 0
    );

    // Calculate average inventory value
    const averageInventoryValue = totalStock * parseFloat(item.cost);

    // Calculate turnover ratio
    const turnoverRatio = calculateStockTurnover(cogs, averageInventoryValue);

    // Calculate days of inventory
    const averageDailyConsumption = cogs / period;
    const daysOfInventory = calculateDaysOfInventory(availableStock, averageDailyConsumption);

    // Calculate EOQ
    const annualDemand = cogs * (365 / period);
    const orderingCost = 50; // Simplified - should come from configuration
    const holdingCost = parseFloat(item.cost) * 0.2; // 20% of cost as holding cost
    const eoq = calculateEOQ(annualDemand, orderingCost, holdingCost);

    // Calculate safety stock
    const demandVariability = Math.sqrt(saleTransactions.length) * parseFloat(item.cost);
    const safetyStock = calculateSafetyStock(averageDailyConsumption, demandVariability);

    return {
      item: {
        id: item.id,
        sku: item.sku,
        name: item.name,
        type: item.type,
        cost: parseFloat(item.cost),
        unit: item.unit
      },
      stock: {
        total: totalStock,
        reserved: totalReserved,
        available: availableStock,
        value: totalStock * parseFloat(item.cost)
      },
      movement: {
        cogs,
        averageDailyConsumption,
        transactions: item.transactions.length
      },
      analysis: {
        turnoverRatio,
        daysOfInventory,
        eoq,
        safetyStock,
        reorderPoint: safetyStock + (averageDailyConsumption * 7) // 7 days lead time
      },
      warehouses: item.stock.map(stock => ({
        warehouse: stock.warehouse,
        quantity: parseFloat(stock.quantity),
        reserved: parseFloat(stock.reserved),
        available: parseFloat(stock.quantity) - parseFloat(stock.reserved)
      }))
    };
  });

  // Sort by turnover ratio (descending)
  turnoverAnalysis.sort((a, b) => b.analysis.turnoverRatio - a.analysis.turnoverRatio);

  // Calculate summary statistics
  const summary = {
    totalItems: turnoverAnalysis.length,
    averageTurnoverRatio: turnoverAnalysis.reduce((sum, item) => sum + item.analysis.turnoverRatio, 0) / turnoverAnalysis.length,
    averageDaysOfInventory: turnoverAnalysis.reduce((sum, item) => sum + item.analysis.daysOfInventory, 0) / turnoverAnalysis.length,
    totalInventoryValue: turnoverAnalysis.reduce((sum, item) => sum + item.stock.value, 0),
    totalCOGS: turnoverAnalysis.reduce((sum, item) => sum + item.movement.cogs, 0)
  };

  // Categorize items by turnover performance
  const performanceCategories = {
    fastMoving: turnoverAnalysis.filter(item => item.analysis.turnoverRatio > 4),
    mediumMoving: turnoverAnalysis.filter(item => item.analysis.turnoverRatio >= 2 && item.analysis.turnoverRatio <= 4),
    slowMoving: turnoverAnalysis.filter(item => item.analysis.turnoverRatio < 2)
  };

  return {
    period,
    summary,
    performanceCategories,
    analysis: turnoverAnalysis
  };
}

async function getInventoryAging(tenantId, options = {}) {
  const { warehouseId, itemType } = options;

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
          unit: true
        }
      },
      warehouse: {
        select: {
          id: true,
          name: true,
          code: true
        }
      },
      movements: {
        orderBy: { createdAt: 'desc' },
        take: 1
      }
    }
  });

  const agingAnalysis = stockRecords.map(stock => {
    const quantity = parseFloat(stock.quantity);
    const value = quantity * parseFloat(stock.item.cost);
    const lastMovement = stock.movements[0];
    
    // Calculate age based on last movement or stock creation
    const lastActivity = lastMovement ? lastMovement.createdAt : stock.createdAt;
    const ageInDays = Math.floor((new Date() - lastActivity) / (1000 * 60 * 60 * 24));

    // Categorize by age
    let ageCategory;
    if (ageInDays <= 30) {
      ageCategory = '0-30 days';
    } else if (ageInDays <= 90) {
      ageCategory = '31-90 days';
    } else if (ageInDays <= 180) {
      ageCategory = '91-180 days';
    } else if (ageInDays <= 365) {
      ageCategory = '181-365 days';
    } else {
      ageCategory = 'Over 1 year';
    }

    return {
      item: stock.item,
      warehouse: stock.warehouse,
      quantity,
      value,
      ageInDays,
      ageCategory,
      lastActivity,
      lastMovement: lastMovement ? {
        type: lastMovement.type,
        quantity: parseFloat(lastMovement.quantity),
        reference: lastMovement.reference,
        createdAt: lastMovement.createdAt
      } : null
    };
  });

  // Group by age category
  const byAgeCategory = agingAnalysis.reduce((acc, item) => {
    if (!acc[item.ageCategory]) {
      acc[item.ageCategory] = {
        items: [],
        totalQuantity: 0,
        totalValue: 0
      };
    }
    acc[item.ageCategory].items.push(item);
    acc[item.ageCategory].totalQuantity += item.quantity;
    acc[item.ageCategory].totalValue += item.value;
    return acc;
  }, {});

  // Calculate summary
  const summary = {
    totalItems: agingAnalysis.length,
    totalValue: agingAnalysis.reduce((sum, item) => sum + item.value, 0),
    averageAge: agingAnalysis.reduce((sum, item) => sum + item.ageInDays, 0) / agingAnalysis.length,
    byAgeCategory
  };

  return {
    summary,
    agingAnalysis,
    byAgeCategory
  };
}

async function getInventoryPerformance(tenantId, options = {}) {
  const { period = 30, warehouseId } = options;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);

  // Get stock records
  const stockRecords = await prisma.stock.findMany({
    where: {
      item: { tenantId },
      ...(warehouseId && { warehouseId })
    },
    include: {
      item: {
        select: {
          id: true,
          sku: true,
          name: true,
          type: true,
          cost: true,
          price: true
        }
      }
    }
  });

  // Get transactions for the period
  const transactions = await prisma.inventoryTransaction.findMany({
    where: {
      item: { tenantId },
      createdAt: { gte: startDate },
      ...(warehouseId && { warehouseId })
    }
  });

  // Calculate key performance indicators
  const totalInventoryValue = stockRecords.reduce((sum, stock) => 
    sum + (parseFloat(stock.quantity) * parseFloat(stock.item.cost)), 0
  );

  const totalInventoryQuantity = stockRecords.reduce((sum, stock) => 
    sum + parseFloat(stock.quantity), 0
  );

  // Calculate COGS
  const saleTransactions = transactions.filter(t => t.type === TransactionType.SALE);
  const cogs = saleTransactions.reduce((sum, t) => 
    sum + (parseFloat(t.quantity) * parseFloat(t.costPerUnit || 0)), 0
  );

  // Calculate inventory turnover
  const averageInventoryValue = totalInventoryValue / 2; // Simplified average
  const inventoryTurnover = cogs / averageInventoryValue;

  // Calculate days sales in inventory
  const averageDailyCOGS = cogs / period;
  const daysSalesInInventory = totalInventoryQuantity / averageDailyCOGS;

  // Calculate gross margin
  const salesRevenue = saleTransactions.reduce((sum, t) => 
    sum + (parseFloat(t.quantity) * parseFloat(t.costPerUnit || 0)), 0
  );
  const grossMargin = salesRevenue > 0 ? ((salesRevenue - cogs) / salesRevenue) * 100 : 0;

  // Calculate stock accuracy (simplified)
  const adjustmentTransactions = transactions.filter(t => t.type === TransactionType.ADJUSTMENT);
  const stockAccuracy = totalInventoryQuantity > 0 
    ? ((totalInventoryQuantity - adjustmentTransactions.reduce((sum, t) => sum + Math.abs(parseFloat(t.quantity)), 0)) / totalInventoryQuantity) * 100
    : 100;

  // Calculate fill rate (simplified)
  const totalDemand = transactions.filter(t => ['SALE', 'USAGE'].includes(t.type))
    .reduce((sum, t) => sum + parseFloat(t.quantity), 0);
  const fulfilledDemand = transactions.filter(t => t.type === TransactionType.SALE)
    .reduce((sum, t) => sum + parseFloat(t.quantity), 0);
  const fillRate = totalDemand > 0 ? (fulfilledDemand / totalDemand) * 100 : 100;

  return {
    period,
    summary: {
      totalInventoryValue,
      totalInventoryQuantity,
      cogs,
      salesRevenue,
      grossMargin
    },
    kpis: {
      inventoryTurnover,
      daysSalesInInventory,
      stockAccuracy,
      fillRate,
      averageDailyCOGS
    },
    trends: {
      dailyTransactions: transactions.length / period,
      dailyCOGS: averageDailyCOGS,
      dailySales: fulfilledDemand / period
    }
  };
}

module.exports = {
  getInventoryDashboard,
  getInventoryValuation,
  getStockTurnoverAnalysis,
  getInventoryAging,
  getInventoryPerformance
};
