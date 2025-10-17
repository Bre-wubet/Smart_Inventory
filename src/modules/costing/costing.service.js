const { prisma } = require('../../config/db');
const { ValidationError } = require('../../core/exceptions');
const { calculateWeightedAverageCost, calculateProfitMargin } = require('../../core/utils/costCalculation');

async function getInventoryValuation({ tenantId, warehouseId, method }) {
  const where = {
    item: { tenantId },
    ...(warehouseId && { warehouseId })
  };

  const stock = await prisma.stock.findMany({
    where,
    include: {
      item: {
        select: { id: true, name: true, sku: true, unit: true, cost: true, price: true }
      },
      warehouse: {
        select: { id: true, name: true, code: true }
      }
    }
  });

  // Get recent transactions for cost calculation
  const itemIds = stock.map(s => s.itemId);
  const transactions = await prisma.inventoryTransaction.findMany({
    where: {
      itemId: { in: itemIds },
      ...(warehouseId && { warehouseId }),
      type: { in: ['PURCHASE', 'ADJUSTMENT'] }
    },
    orderBy: { createdAt: 'desc' },
    take: 1000 // Limit for performance
  });

  const valuation = stock.map(stockItem => {
    const itemTransactions = transactions.filter(t => t.itemId === stockItem.itemId);
    const quantity = parseFloat(stockItem.quantity);
    
    let unitCost;
    switch (method) {
      case 'FIFO':
        unitCost = calculateFIFOCost(itemTransactions);
        break;
      case 'LIFO':
        unitCost = calculateLIFOCost(itemTransactions);
        break;
      case 'Weighted Average':
      default:
        unitCost = calculateWeightedAverageCost(itemTransactions);
        break;
    }

    const totalCost = quantity * unitCost;
    const totalValue = quantity * parseFloat(stockItem.item.price || 0);
    const profitMargin = calculateProfitMargin(parseFloat(stockItem.item.price || 0), unitCost);

    return {
      item: stockItem.item,
      warehouse: stockItem.warehouse,
      quantity,
      unitCost,
      totalCost,
      totalValue,
      profitMargin,
      valuationMethod: method
    };
  });

  const summary = {
    totalInventoryValue: valuation.reduce((sum, item) => sum + item.totalValue, 0),
    totalInventoryCost: valuation.reduce((sum, item) => sum + item.totalCost, 0),
    totalProfit: valuation.reduce((sum, item) => sum + (item.totalValue - item.totalCost), 0),
    averageMargin: valuation.length > 0 ? 
      valuation.reduce((sum, item) => sum + item.profitMargin, 0) / valuation.length : 0,
    itemCount: valuation.length
  };

  return {
    summary,
    items: valuation,
    method,
    generatedAt: new Date()
  };
}

async function getCostAnalysis({ tenantId, itemId, period, warehouseId }) {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - (period * 24 * 60 * 60 * 1000));

  const where = {
    itemId,
    createdAt: { gte: startDate, lte: endDate },
    ...(warehouseId && { warehouseId })
  };

  const [transactions, item] = await Promise.all([
    prisma.inventoryTransaction.findMany({
      where,
      orderBy: { createdAt: 'asc' }
    }),
    prisma.item.findFirst({
      where: { id: itemId, tenantId },
      select: { id: true, name: true, sku: true, unit: true, cost: true, price: true }
    })
  ]);

  if (!item) {
    throw new ValidationError('Item not found');
  }

  // Calculate cost trends
  const costTrends = calculateCostTrends(transactions);
  const averageCost = calculateWeightedAverageCost(transactions);
  const currentPrice = parseFloat(item.price || 0);
  const profitMargin = calculateProfitMargin(currentPrice, averageCost);

  // Calculate consumption patterns
  const consumption = calculateConsumptionPattern(transactions, period);

  return {
    item,
    period: { startDate, endDate, days: period },
    costAnalysis: {
      averageCost,
      currentPrice,
      profitMargin,
      costTrends,
      consumption
    },
    transactions: transactions.slice(0, 50) // Limit for response size
  };
}

async function getProfitAnalysis({ tenantId, startDate, endDate, itemId, customer }) {
  const where = {
    item: { tenantId },
    createdAt: { gte: startDate, lte: endDate },
    type: 'SALE',
    ...(itemId && { itemId }),
    ...(customer && { saleOrder: { customer: { contains: customer, mode: 'insensitive' } } })
  };

  const transactions = await prisma.inventoryTransaction.findMany({
    where,
    include: {
      item: {
        select: { id: true, name: true, sku: true, unit: true, cost: true, price: true }
      },
      saleOrder: {
        select: { id: true, customer: true, reference: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  // Group by item for analysis
  const itemAnalysis = transactions.reduce((acc, transaction) => {
    const itemId = transaction.itemId;
    if (!acc[itemId]) {
      acc[itemId] = {
        item: transaction.item,
        totalQuantity: 0,
        totalRevenue: 0,
        totalCost: 0,
        transactions: []
      };
    }

    const quantity = parseFloat(transaction.quantity);
    const revenue = quantity * parseFloat(transaction.item.price || 0);
    const cost = quantity * parseFloat(transaction.costPerUnit || transaction.item.cost || 0);

    acc[itemId].totalQuantity += quantity;
    acc[itemId].totalRevenue += revenue;
    acc[itemId].totalCost += cost;
    acc[itemId].transactions.push(transaction);
  }, {});

  const profitAnalysis = Object.values(itemAnalysis).map(analysis => ({
    ...analysis,
    totalProfit: analysis.totalRevenue - analysis.totalCost,
    profitMargin: analysis.totalRevenue > 0 ? 
      ((analysis.totalRevenue - analysis.totalCost) / analysis.totalRevenue) * 100 : 0
  }));

  const summary = {
    totalRevenue: profitAnalysis.reduce((sum, item) => sum + item.totalRevenue, 0),
    totalCost: profitAnalysis.reduce((sum, item) => sum + item.totalCost, 0),
    totalProfit: profitAnalysis.reduce((sum, item) => sum + item.totalProfit, 0),
    averageMargin: profitAnalysis.length > 0 ? 
      profitAnalysis.reduce((sum, item) => sum + item.profitMargin, 0) / profitAnalysis.length : 0,
    itemCount: profitAnalysis.length
  };

  return {
    summary,
    items: profitAnalysis,
    period: { startDate, endDate },
    filters: { itemId, customer }
  };
}

async function getRecipeCostAnalysis(recipeId, tenantId) {
  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, tenantId },
    include: {
      product: {
        select: { id: true, name: true, sku: true, unit: true, cost: true, price: true }
      },
      items: {
        include: {
          item: {
            select: { id: true, name: true, sku: true, unit: true, cost: true }
          }
        }
      },
      batches: {
        include: {
          transactions: {
            include: {
              item: {
                select: { id: true, name: true, sku: true }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 10
      }
    }
  });

  if (!recipe) {
    throw new ValidationError('Recipe not found');
  }

  // Calculate theoretical cost
  const theoreticalCost = recipe.items.reduce((sum, item) => 
    sum + (parseFloat(item.quantity) * parseFloat(item.item.cost || 0)), 0
  );

  // Calculate actual costs from production batches
  const actualCosts = recipe.batches.map(batch => {
    const ingredientCost = batch.transactions
      .filter(t => t.type === 'USAGE')
      .reduce((sum, t) => sum + (parseFloat(t.quantity) * parseFloat(t.costPerUnit || 0)), 0);
    
    return {
      batch,
      ingredientCost,
      actualCostPerUnit: batch.quantity > 0 ? ingredientCost / batch.quantity : 0,
      plannedCostPerUnit: parseFloat(batch.costPerUnit || 0)
    };
  });

  const averageActualCost = actualCosts.length > 0 ? 
    actualCosts.reduce((sum, batch) => sum + batch.actualCostPerUnit, 0) / actualCosts.length : 0;

  const costVariance = averageActualCost - theoreticalCost;
  const variancePercentage = theoreticalCost > 0 ? (costVariance / theoreticalCost) * 100 : 0;

  return {
    recipe: {
      id: recipe.id,
      name: recipe.name,
      product: recipe.product
    },
    costAnalysis: {
      theoreticalCost,
      averageActualCost,
      costVariance,
      variancePercentage,
      batches: actualCosts
    },
    ingredientBreakdown: recipe.items.map(item => ({
      item: item.item,
      quantity: parseFloat(item.quantity),
      unitCost: parseFloat(item.item.cost || 0),
      totalCost: parseFloat(item.quantity) * parseFloat(item.item.cost || 0)
    }))
  };
}

async function getProductionCostAnalysis(batchId, tenantId) {
  const batch = await prisma.productionBatch.findFirst({
    where: { 
      id: batchId,
      recipe: { tenantId }
    },
    include: {
      recipe: {
        include: {
          product: {
            select: { id: true, name: true, sku: true, unit: true, cost: true, price: true }
          },
          items: {
            include: {
              item: {
                select: { id: true, name: true, sku: true, unit: true, cost: true }
              }
            }
          }
        }
      },
      transactions: {
        include: {
          item: {
            select: { id: true, name: true, sku: true, unit: true }
          }
        }
      }
    }
  });

  if (!batch) {
    throw new ValidationError('Production batch not found');
  }

  // Calculate actual costs
  const ingredientTransactions = batch.transactions.filter(t => t.type === 'USAGE');
  const actualIngredientCost = ingredientTransactions.reduce((sum, t) => 
    sum + (parseFloat(t.quantity) * parseFloat(t.costPerUnit || 0)), 0
  );

  const plannedIngredientCost = batch.recipe.items.reduce((sum, item) => 
    sum + (parseFloat(item.quantity) * parseFloat(item.item.cost || 0) * batch.quantity), 0
  );

  const actualCostPerUnit = batch.quantity > 0 ? actualIngredientCost / batch.quantity : 0;
  const plannedCostPerUnit = batch.quantity > 0 ? plannedIngredientCost / batch.quantity : 0;

  const costVariance = actualCostPerUnit - plannedCostPerUnit;
  const variancePercentage = plannedCostPerUnit > 0 ? (costVariance / plannedCostPerUnit) * 100 : 0;

  // Calculate efficiency metrics
  const efficiency = plannedCostPerUnit > 0 ? (plannedCostPerUnit / actualCostPerUnit) * 100 : 0;

  return {
    batch: {
      id: batch.id,
      batchRef: batch.batchRef,
      quantity: parseFloat(batch.quantity),
      startedAt: batch.startedAt,
      finishedAt: batch.finishedAt
    },
    recipe: batch.recipe,
    costAnalysis: {
      actualIngredientCost,
      plannedIngredientCost,
      actualCostPerUnit,
      plannedCostPerUnit,
      costVariance,
      variancePercentage,
      efficiency
    },
    ingredientAnalysis: ingredientTransactions.map(t => {
      const plannedItem = batch.recipe.items.find(ri => ri.itemId === t.itemId);
      const plannedQuantity = plannedItem ? parseFloat(plannedItem.quantity) * batch.quantity : 0;
      const actualQuantity = parseFloat(t.quantity);
      
      return {
        item: t.item,
        plannedQuantity,
        actualQuantity,
        quantityVariance: actualQuantity - plannedQuantity,
        plannedCost: plannedQuantity * parseFloat(t.costPerUnit || 0),
        actualCost: actualQuantity * parseFloat(t.costPerUnit || 0)
      };
    })
  };
}

async function getSupplierCostComparison(itemId, tenantId) {
  const item = await prisma.item.findFirst({
    where: { id: itemId, tenantId },
    select: { id: true, name: true, sku: true, unit: true, cost: true, price: true }
  });

  if (!item) {
    throw new ValidationError('Item not found');
  }

  const itemSuppliers = await prisma.itemSupplier.findMany({
    where: { itemId },
    include: {
      supplier: {
        select: { id: true, name: true, contact: true, email: true }
      }
    },
    orderBy: { cost: 'asc' }
  });

  // Get recent purchase history for each supplier
  const supplierAnalysis = await Promise.all(
    itemSuppliers.map(async (itemSupplier) => {
      const recentPurchases = await prisma.inventoryTransaction.findMany({
        where: {
          itemId,
          type: 'PURCHASE',
          purchaseOrder: {
            supplierId: itemSupplier.supplierId
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 10
      });

      const averagePurchaseCost = recentPurchases.length > 0 ? 
        recentPurchases.reduce((sum, t) => sum + parseFloat(t.costPerUnit || 0), 0) / recentPurchases.length : 0;

      return {
        supplier: itemSupplier.supplier,
        currentCost: parseFloat(itemSupplier.cost),
        leadTime: itemSupplier.leadTime,
        currency: itemSupplier.currency,
        averagePurchaseCost,
        recentPurchases: recentPurchases.length,
        costVariance: averagePurchaseCost > 0 ? 
          ((parseFloat(itemSupplier.cost) - averagePurchaseCost) / averagePurchaseCost) * 100 : 0
      };
    })
  );

  const cheapestSupplier = supplierAnalysis.reduce((min, supplier) => 
    supplier.currentCost < min.currentCost ? supplier : min
  );

  return {
    item,
    suppliers: supplierAnalysis,
    cheapestSupplier,
    costSavings: supplierAnalysis.map(supplier => ({
      supplier: supplier.supplier,
      potentialSavings: supplier.currentCost - cheapestSupplier.currentCost,
      savingsPercentage: cheapestSupplier.currentCost > 0 ? 
        ((supplier.currentCost - cheapestSupplier.currentCost) / cheapestSupplier.currentCost) * 100 : 0
    }))
  };
}

async function getCostTrends({ tenantId, itemId, period, warehouseId }) {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - (period * 24 * 60 * 60 * 1000));

  const where = {
    item: { tenantId },
    createdAt: { gte: startDate, lte: endDate },
    type: { in: ['PURCHASE', 'ADJUSTMENT'] },
    ...(itemId && { itemId }),
    ...(warehouseId && { warehouseId })
  };

  const transactions = await prisma.inventoryTransaction.findMany({
    where,
    include: {
      item: {
        select: { id: true, name: true, sku: true }
      }
    },
    orderBy: { createdAt: 'asc' }
  });

  // Group by date and calculate daily averages
  const dailyTrends = {};
  transactions.forEach(transaction => {
    const date = transaction.createdAt.toISOString().split('T')[0];
    if (!dailyTrends[date]) {
      dailyTrends[date] = {
        date,
        totalCost: 0,
        totalQuantity: 0,
        transactions: 0
      };
    }
    
    dailyTrends[date].totalCost += parseFloat(transaction.costPerUnit || 0) * parseFloat(transaction.quantity);
    dailyTrends[date].totalQuantity += parseFloat(transaction.quantity);
    dailyTrends[date].transactions += 1;
  });

  const trends = Object.values(dailyTrends).map(day => ({
    ...day,
    averageCost: day.totalQuantity > 0 ? day.totalCost / day.totalQuantity : 0
  }));

  // Calculate trend direction
  const firstCost = trends[0]?.averageCost || 0;
  const lastCost = trends[trends.length - 1]?.averageCost || 0;
  const trendDirection = lastCost > firstCost ? 'increasing' : lastCost < firstCost ? 'decreasing' : 'stable';
  const trendPercentage = firstCost > 0 ? ((lastCost - firstCost) / firstCost) * 100 : 0;

  return {
    trends,
    summary: {
      period: { startDate, endDate, days: period },
      firstCost,
      lastCost,
      trendDirection,
      trendPercentage,
      totalTransactions: transactions.length
    }
  };
}

async function getMarginAnalysis({ tenantId, startDate, endDate, groupBy }) {
  const where = {
    item: { tenantId },
    createdAt: { gte: startDate, lte: endDate },
    type: 'SALE'
  };

  const transactions = await prisma.inventoryTransaction.findMany({
    where,
    include: {
      item: {
        select: { id: true, name: true, sku: true, unit: true, cost: true, price: true, type: true }
      },
      saleOrder: {
        select: { id: true, customer: true }
      }
    }
  });

  // Group analysis based on groupBy parameter
  const groupedAnalysis = {};
  
  transactions.forEach(transaction => {
    let groupKey;
    switch (groupBy) {
      case 'customer':
        groupKey = transaction.saleOrder?.customer || 'Unknown';
        break;
      case 'category':
        groupKey = transaction.item.type;
        break;
      case 'item':
      default:
        groupKey = transaction.itemId;
        break;
    }

    if (!groupedAnalysis[groupKey]) {
      groupedAnalysis[groupKey] = {
        key: groupKey,
        totalRevenue: 0,
        totalCost: 0,
        totalQuantity: 0,
        transactions: 0
      };
    }

    const quantity = parseFloat(transaction.quantity);
    const revenue = quantity * parseFloat(transaction.item.price || 0);
    const cost = quantity * parseFloat(transaction.costPerUnit || transaction.item.cost || 0);

    groupedAnalysis[groupKey].totalRevenue += revenue;
    groupedAnalysis[groupKey].totalCost += cost;
    groupedAnalysis[groupKey].totalQuantity += quantity;
    groupedAnalysis[groupKey].transactions += 1;
  });

  const analysis = Object.values(groupedAnalysis).map(group => ({
    ...group,
    totalProfit: group.totalRevenue - group.totalCost,
    profitMargin: group.totalRevenue > 0 ? ((group.totalRevenue - group.totalCost) / group.totalRevenue) * 100 : 0,
    averageOrderValue: group.transactions > 0 ? group.totalRevenue / group.transactions : 0
  }));

  const summary = {
    totalRevenue: analysis.reduce((sum, group) => sum + group.totalRevenue, 0),
    totalCost: analysis.reduce((sum, group) => sum + group.totalCost, 0),
    totalProfit: analysis.reduce((sum, group) => sum + group.totalProfit, 0),
    averageMargin: analysis.length > 0 ? 
      analysis.reduce((sum, group) => sum + group.profitMargin, 0) / analysis.length : 0,
    groupCount: analysis.length
  };

  return {
    summary,
    groups: analysis.sort((a, b) => b.totalProfit - a.totalProfit),
    groupBy,
    period: { startDate, endDate }
  };
}

async function generateCostReport({ tenantId, reportType, parameters }) {
  const reportTypes = {
    'inventory_valuation': () => getInventoryValuation({ tenantId, ...parameters }),
    'profit_analysis': () => getProfitAnalysis({ tenantId, ...parameters }),
    'cost_trends': () => getCostTrends({ tenantId, ...parameters }),
    'margin_analysis': () => getMarginAnalysis({ tenantId, ...parameters })
  };

  if (!reportTypes[reportType]) {
    throw new ValidationError('Invalid report type');
  }

  const reportData = await reportTypes[reportType]();
  
  return {
    reportType,
    parameters,
    data: reportData,
    generatedAt: new Date(),
    generatedBy: tenantId
  };
}

// Helper functions
function calculateFIFOCost(transactions) {
  // Simplified FIFO calculation - in production, implement proper FIFO logic
  return calculateWeightedAverageCost(transactions);
}

function calculateLIFOCost(transactions) {
  // Simplified LIFO calculation - in production, implement proper LIFO logic
  return calculateWeightedAverageCost(transactions);
}

function calculateCostTrends(transactions) {
  if (transactions.length === 0) return { direction: 'stable', percentage: 0 };
  
  const sortedTransactions = transactions.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const firstCost = parseFloat(sortedTransactions[0].costPerUnit || 0);
  const lastCost = parseFloat(sortedTransactions[sortedTransactions.length - 1].costPerUnit || 0);
  
  const direction = lastCost > firstCost ? 'increasing' : lastCost < firstCost ? 'decreasing' : 'stable';
  const percentage = firstCost > 0 ? ((lastCost - firstCost) / firstCost) * 100 : 0;
  
  return { direction, percentage, firstCost, lastCost };
}

function calculateConsumptionPattern(transactions, period) {
  const outgoingTransactions = transactions.filter(t => ['SALE', 'USAGE', 'TRANSFER'].includes(t.type));
  const totalConsumption = outgoingTransactions.reduce((sum, t) => sum + parseFloat(t.quantity), 0);
  const averageDailyConsumption = totalConsumption / period;
  
  return {
    totalConsumption,
    averageDailyConsumption,
    consumptionRate: averageDailyConsumption,
    period
  };
}

module.exports = {
  getInventoryValuation,
  getCostAnalysis,
  getProfitAnalysis,
  getRecipeCostAnalysis,
  getProductionCostAnalysis,
  getSupplierCostComparison,
  getCostTrends,
  getMarginAnalysis,
  generateCostReport
};
