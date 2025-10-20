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

// Advanced Cost Analytics Functions

// Get comprehensive cost analytics dashboard
async function getCostAnalyticsDashboard(tenantId, options = {}) {
  const { 
    startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    endDate = new Date(),
    groupBy = 'month'
  } = options;

  const where = {
    item: { tenantId },
    createdAt: { gte: startDate, lte: endDate }
  };

  const [purchaseTransactions, saleTransactions, inventoryValuation] = await Promise.all([
    prisma.inventoryTransaction.findMany({
      where: { ...where, type: { in: ['PURCHASE', 'ADJUSTMENT'] } },
      include: {
        item: { select: { id: true, name: true, sku: true, type: true } }
      },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.inventoryTransaction.findMany({
      where: { ...where, type: 'SALE' },
      include: {
        item: { select: { id: true, name: true, sku: true, type: true, price: true } },
        saleOrder: { select: { customer: true } }
      },
      orderBy: { createdAt: 'asc' }
    }),
    getInventoryValuation({ tenantId, method: 'Weighted Average' })
  ]);

  // Group costs by time period
  const costTrends = {};
  purchaseTransactions.forEach(transaction => {
    let groupKey;
    const date = new Date(transaction.createdAt);
    
    switch (groupBy) {
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
      case 'quarter':
        const quarter = Math.floor(date.getMonth() / 3) + 1;
        groupKey = `${date.getFullYear()}-Q${quarter}`;
        break;
      default:
        groupKey = date.toISOString().slice(0, 7);
    }

    if (!costTrends[groupKey]) {
      costTrends[groupKey] = {
        period: groupKey,
        totalCost: 0,
        totalQuantity: 0,
        transactions: 0,
        items: new Set(),
        categories: {}
      };
    }

    const cost = parseFloat(transaction.costPerUnit || 0) * parseFloat(transaction.quantity);
    costTrends[groupKey].totalCost += cost;
    costTrends[groupKey].totalQuantity += parseFloat(transaction.quantity);
    costTrends[groupKey].transactions += 1;
    costTrends[groupKey].items.add(transaction.itemId);

    // Group by category
    const category = transaction.item.type;
    if (!costTrends[groupKey].categories[category]) {
      costTrends[groupKey].categories[category] = { cost: 0, quantity: 0 };
    }
    costTrends[groupKey].categories[category].cost += cost;
    costTrends[groupKey].categories[category].quantity += parseFloat(transaction.quantity);
  });

  // Calculate profit trends
  const profitTrends = {};
  saleTransactions.forEach(transaction => {
    let groupKey;
    const date = new Date(transaction.createdAt);
    
    switch (groupBy) {
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
      case 'quarter':
        const quarter = Math.floor(date.getMonth() / 3) + 1;
        groupKey = `${date.getFullYear()}-Q${quarter}`;
        break;
      default:
        groupKey = date.toISOString().slice(0, 7);
    }

    if (!profitTrends[groupKey]) {
      profitTrends[groupKey] = {
        period: groupKey,
        totalRevenue: 0,
        totalCost: 0,
        totalProfit: 0,
        transactions: 0,
        customers: new Set()
      };
    }

    const revenue = parseFloat(transaction.quantity) * parseFloat(transaction.item.price || 0);
    const cost = parseFloat(transaction.quantity) * parseFloat(transaction.costPerUnit || 0);
    const profit = revenue - cost;

    profitTrends[groupKey].totalRevenue += revenue;
    profitTrends[groupKey].totalCost += cost;
    profitTrends[groupKey].totalProfit += profit;
    profitTrends[groupKey].transactions += 1;
    profitTrends[groupKey].customers.add(transaction.saleOrder?.customer);
  });

  // Calculate analytics
  const costAnalytics = Object.values(costTrends).map(trend => ({
    ...trend,
    uniqueItemsCount: trend.items.size,
    averageCostPerTransaction: trend.transactions > 0 ? trend.totalCost / trend.transactions : 0,
    averageCostPerUnit: trend.totalQuantity > 0 ? trend.totalCost / trend.totalQuantity : 0
  }));

  const profitAnalytics = Object.values(profitTrends).map(trend => ({
    ...trend,
    uniqueCustomersCount: trend.customers.size,
    profitMargin: trend.totalRevenue > 0 ? (trend.totalProfit / trend.totalRevenue) * 100 : 0,
    averageOrderValue: trend.transactions > 0 ? trend.totalRevenue / trend.transactions : 0
  }));

  // Calculate summary statistics
  const summary = {
    totalInventoryValue: inventoryValuation.summary.totalInventoryValue,
    totalInventoryCost: inventoryValuation.summary.totalInventoryCost,
    totalCostPeriod: costAnalytics.reduce((sum, trend) => sum + trend.totalCost, 0),
    totalProfitPeriod: profitAnalytics.reduce((sum, trend) => sum + trend.totalProfit, 0),
    averageProfitMargin: profitAnalytics.length > 0 
      ? profitAnalytics.reduce((sum, trend) => sum + trend.profitMargin, 0) / profitAnalytics.length 
      : 0,
    costEfficiency: inventoryValuation.summary.totalInventoryValue > 0 
      ? (inventoryValuation.summary.totalInventoryCost / inventoryValuation.summary.totalInventoryValue) * 100 
      : 0
  };

  return {
    costTrends: costAnalytics,
    profitTrends: profitAnalytics,
    inventoryValuation: inventoryValuation.summary,
    summary,
    period: { startDate, endDate, groupBy }
  };
}

// Get cost optimization recommendations
async function getCostOptimizationRecommendations(tenantId, options = {}) {
  const { 
    startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    endDate = new Date(),
    focus = 'all' // all, purchasing, production, inventory
  } = options;

  const recommendations = [];

  // Analyze purchasing patterns
  if (focus === 'all' || focus === 'purchasing') {
    const purchaseAnalysis = await analyzePurchasingPatterns(tenantId, startDate, endDate);
    recommendations.push(...purchaseAnalysis);
  }

  // Analyze production costs
  if (focus === 'all' || focus === 'production') {
    const productionAnalysis = await analyzeProductionCosts(tenantId, startDate, endDate);
    recommendations.push(...productionAnalysis);
  }

  // Analyze inventory costs
  if (focus === 'all' || focus === 'inventory') {
    const inventoryAnalysis = await analyzeInventoryCosts(tenantId);
    recommendations.push(...inventoryAnalysis);
  }

  // Sort by potential savings
  recommendations.sort((a, b) => b.potentialSavings - a.potentialSavings);

  return {
    recommendations,
    summary: {
      totalRecommendations: recommendations.length,
      totalPotentialSavings: recommendations.reduce((sum, rec) => sum + rec.potentialSavings, 0),
      highImpactRecommendations: recommendations.filter(rec => rec.impact === 'HIGH').length,
      mediumImpactRecommendations: recommendations.filter(rec => rec.impact === 'MEDIUM').length,
      lowImpactRecommendations: recommendations.filter(rec => rec.impact === 'LOW').length
    },
    period: { startDate, endDate }
  };
}

// Get cost forecasting
async function getCostForecast(tenantId, options = {}) {
  const { 
    forecastPeriod = 30, // days
    confidenceLevel = 95,
    itemId,
    category
  } = options;

  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - 180 * 24 * 60 * 60 * 1000); // 180 days historical data

  const where = {
    item: { tenantId },
    createdAt: { gte: startDate, lte: endDate },
    type: { in: ['PURCHASE', 'ADJUSTMENT'] },
    ...(itemId && { itemId }),
    ...(category && { item: { type: category } })
  };

  const transactions = await prisma.inventoryTransaction.findMany({
    where,
    include: {
      item: { select: { id: true, name: true, sku: true, type: true } }
    },
    orderBy: { createdAt: 'asc' }
  });

  // Group by item for individual forecasting
  const itemForecasts = {};
  transactions.forEach(transaction => {
    const itemId = transaction.itemId;
    if (!itemForecasts[itemId]) {
      itemForecasts[itemId] = {
        item: transaction.item,
        costs: [],
        quantities: [],
        dates: []
      };
    }

    itemForecasts[itemId].costs.push(parseFloat(transaction.costPerUnit || 0));
    itemForecasts[itemId].quantities.push(parseFloat(transaction.quantity));
    itemForecasts[itemId].dates.push(transaction.createdAt);
  });

  // Calculate forecasts for each item
  const forecasts = Object.values(itemForecasts).map(itemData => {
    const { costs, quantities, dates } = itemData;
    
    // Simple linear regression for cost trend
    const costTrend = calculateLinearTrend(costs, dates);
    const quantityTrend = calculateLinearTrend(quantities, dates);
    
    // Calculate forecasted values
    const forecastedCost = costTrend.slope * forecastPeriod + costTrend.intercept;
    const forecastedQuantity = quantityTrend.slope * forecastPeriod + quantityTrend.intercept;
    
    // Calculate confidence intervals
    const costVariance = calculateVariance(costs);
    const quantityVariance = calculateVariance(quantities);
    
    const costConfidenceInterval = calculateConfidenceInterval(
      forecastedCost, 
      costVariance, 
      costs.length, 
      confidenceLevel
    );
    
    const quantityConfidenceInterval = calculateConfidenceInterval(
      forecastedQuantity, 
      quantityVariance, 
      quantities.length, 
      confidenceLevel
    );

    return {
      item: itemData.item,
      currentCost: costs[costs.length - 1] || 0,
      forecastedCost: Math.max(0, forecastedCost),
      costTrend: costTrend.slope > 0 ? 'increasing' : costTrend.slope < 0 ? 'decreasing' : 'stable',
      costConfidenceInterval,
      currentQuantity: quantities[quantities.length - 1] || 0,
      forecastedQuantity: Math.max(0, forecastedQuantity),
      quantityTrend: quantityTrend.slope > 0 ? 'increasing' : quantityTrend.slope < 0 ? 'decreasing' : 'stable',
      quantityConfidenceInterval,
      forecastAccuracy: calculateForecastAccuracy(costs, costTrend),
      dataPoints: costs.length
    };
  });

  // Calculate aggregate forecast
  const aggregateForecast = {
    totalForecastedCost: forecasts.reduce((sum, forecast) => sum + forecast.forecastedCost, 0),
    totalForecastedQuantity: forecasts.reduce((sum, forecast) => sum + forecast.forecastedQuantity, 0),
    averageCostTrend: forecasts.reduce((sum, forecast) => 
      sum + (forecast.costTrend === 'increasing' ? 1 : forecast.costTrend === 'decreasing' ? -1 : 0), 0
    ) / forecasts.length,
    averageForecastAccuracy: forecasts.length > 0 
      ? forecasts.reduce((sum, forecast) => sum + forecast.forecastAccuracy, 0) / forecasts.length 
      : 0
  };

  return {
    forecasts,
    aggregateForecast,
    forecastPeriod,
    confidenceLevel,
    historicalPeriod: { startDate, endDate },
    summary: {
      totalItems: forecasts.length,
      increasingCostItems: forecasts.filter(f => f.costTrend === 'increasing').length,
      decreasingCostItems: forecasts.filter(f => f.costTrend === 'decreasing').length,
      stableCostItems: forecasts.filter(f => f.costTrend === 'stable').length,
      averageAccuracy: aggregateForecast.averageForecastAccuracy
    }
  };
}

// Get cost benchmarking analysis
async function getCostBenchmarking(tenantId, options = {}) {
  const { 
    benchmarkType = 'industry', // industry, competitor, historical
    category,
    itemId
  } = options;

  const where = {
    item: { tenantId },
    ...(category && { item: { type: category } }),
    ...(itemId && { itemId })
  };

  const transactions = await prisma.inventoryTransaction.findMany({
    where: {
      ...where,
      type: { in: ['PURCHASE', 'ADJUSTMENT'] },
      createdAt: { gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }
    },
    include: {
      item: { select: { id: true, name: true, sku: true, type: true } }
    }
  });

  // Calculate current cost metrics
  const currentMetrics = calculateCurrentCostMetrics(transactions);
  
  // Generate benchmark data (in real implementation, this would come from external sources)
  const benchmarkData = generateBenchmarkData(benchmarkType, currentMetrics);
  
  // Calculate performance vs benchmarks
  const performanceAnalysis = calculatePerformanceVsBenchmark(currentMetrics, benchmarkData);

  return {
    currentMetrics,
    benchmarkData,
    performanceAnalysis,
    recommendations: generateBenchmarkRecommendations(performanceAnalysis),
    benchmarkType,
    period: { startDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), endDate: new Date() }
  };
}

// Helper functions for advanced analytics
async function analyzePurchasingPatterns(tenantId, startDate, endDate) {
  const recommendations = [];
  
  // Analyze supplier cost variations
  const supplierAnalysis = await prisma.itemSupplier.findMany({
    where: {
      item: { tenantId }
    },
    include: {
      item: { select: { id: true, name: true, sku: true } },
      supplier: { select: { id: true, name: true } }
    }
  });

  // Group by item and find cost variations
  const itemSuppliers = {};
  supplierAnalysis.forEach(itemSupplier => {
    const itemId = itemSupplier.itemId;
    if (!itemSuppliers[itemId]) {
      itemSuppliers[itemId] = [];
    }
    itemSuppliers[itemId].push(itemSupplier);
  });

  Object.entries(itemSuppliers).forEach(([itemId, suppliers]) => {
    if (suppliers.length > 1) {
      const costs = suppliers.map(s => parseFloat(s.cost));
      const minCost = Math.min(...costs);
      const maxCost = Math.max(...costs);
      const costVariation = ((maxCost - minCost) / minCost) * 100;

      if (costVariation > 20) { // More than 20% variation
        recommendations.push({
          type: 'PURCHASING',
          category: 'supplier_optimization',
          title: `High Cost Variation for ${suppliers[0].item.name}`,
          description: `Cost variation of ${costVariation.toFixed(1)}% between suppliers`,
          impact: costVariation > 50 ? 'HIGH' : costVariation > 30 ? 'MEDIUM' : 'LOW',
          potentialSavings: (maxCost - minCost) * 100, // Assuming 100 units
          recommendation: 'Consider negotiating better rates or switching to lower-cost suppliers',
          data: {
            item: suppliers[0].item,
            suppliers: suppliers.map(s => ({
              supplier: s.supplier,
              cost: parseFloat(s.cost),
              leadTime: s.leadTime
            })),
            costVariation
          }
        });
      }
    }
  });

  return recommendations;
}

async function analyzeProductionCosts(tenantId, startDate, endDate) {
  const recommendations = [];
  
  // Analyze production batch costs
  const batches = await prisma.productionBatch.findMany({
    where: {
      recipe: { tenantId },
      createdAt: { gte: startDate, lte: endDate }
    },
    include: {
      recipe: {
        include: {
          product: { select: { id: true, name: true, sku: true } },
          items: {
            include: {
              item: { select: { id: true, name: true, cost: true } }
            }
          }
        }
      }
    }
  });

  // Group by recipe and analyze cost variations
  const recipeBatches = {};
  batches.forEach(batch => {
    const recipeId = batch.recipeId;
    if (!recipeBatches[recipeId]) {
      recipeBatches[recipeId] = [];
    }
    recipeBatches[recipeId].push(batch);
  });

  Object.entries(recipeBatches).forEach(([recipeId, recipeBatches]) => {
    if (recipeBatches.length > 3) { // Need multiple batches for analysis
      const costs = recipeBatches.map(b => parseFloat(b.costPerUnit || 0)).filter(c => c > 0);
      if (costs.length > 1) {
        const avgCost = costs.reduce((sum, c) => sum + c, 0) / costs.length;
        const costVariance = calculateVariance(costs);
        const coefficientOfVariation = Math.sqrt(costVariance) / avgCost;

        if (coefficientOfVariation > 0.15) { // More than 15% variation
          recommendations.push({
            type: 'PRODUCTION',
            category: 'cost_consistency',
            title: `High Cost Variation in ${recipeBatches[0].recipe.name}`,
            description: `Production cost variation of ${(coefficientOfVariation * 100).toFixed(1)}%`,
            impact: coefficientOfVariation > 0.25 ? 'HIGH' : 'MEDIUM',
            potentialSavings: avgCost * coefficientOfVariation * 1000, // Assuming 1000 units
            recommendation: 'Review production processes and ingredient usage for consistency',
            data: {
              recipe: recipeBatches[0].recipe,
              averageCost: avgCost,
              costVariance: coefficientOfVariation,
              batchCount: costs.length
            }
          });
        }
      }
    }
  });

  return recommendations;
}

async function analyzeInventoryCosts(tenantId) {
  const recommendations = [];
  
  // Analyze inventory valuation
  const valuation = await getInventoryValuation({ tenantId, method: 'Weighted Average' });
  
  // Find high-value, slow-moving items
  const slowMovingItems = valuation.items.filter(item => {
    const value = item.totalValue;
    const cost = item.totalCost;
    const margin = item.profitMargin;
    
    // High value items with low margins or high inventory value
    return (value > 10000 && margin < 20) || (value > 50000);
  });

  slowMovingItems.forEach(item => {
    recommendations.push({
      type: 'INVENTORY',
      category: 'inventory_optimization',
      title: `High-Value Inventory: ${item.item.name}`,
      description: `Inventory value of $${item.totalValue.toFixed(2)} with ${item.profitMargin.toFixed(1)}% margin`,
      impact: item.totalValue > 50000 ? 'HIGH' : 'MEDIUM',
      potentialSavings: item.totalValue * 0.1, // 10% of inventory value
      recommendation: 'Consider reducing inventory levels or improving turnover',
      data: {
        item: item.item,
        inventoryValue: item.totalValue,
        inventoryCost: item.totalCost,
        profitMargin: item.profitMargin,
        quantity: item.quantity
      }
    });
  });

  return recommendations;
}

// Mathematical helper functions
function calculateLinearTrend(values, dates) {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] || 0 };

  const x = dates.map((d, i) => i);
  const y = values;

  const sumX = x.reduce((sum, val) => sum + val, 0);
  const sumY = y.reduce((sum, val) => sum + val, 0);
  const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
  const sumXX = x.reduce((sum, val) => sum + val * val, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

function calculateVariance(values) {
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
}

function calculateConfidenceInterval(forecast, variance, sampleSize, confidenceLevel) {
  const zScore = confidenceLevel === 95 ? 1.96 : confidenceLevel === 99 ? 2.58 : 1.645;
  const marginOfError = zScore * Math.sqrt(variance / sampleSize);
  
  return {
    lower: Math.max(0, forecast - marginOfError),
    upper: forecast + marginOfError,
    marginOfError
  };
}

function calculateForecastAccuracy(actualValues, trend) {
  if (actualValues.length < 2) return 0;
  
  const predictedValues = actualValues.map((_, i) => trend.slope * i + trend.intercept);
  const errors = actualValues.map((actual, i) => Math.abs(actual - predictedValues[i]));
  const meanError = errors.reduce((sum, err) => sum + err, 0) / errors.length;
  const meanActual = actualValues.reduce((sum, val) => sum + val, 0) / actualValues.length;
  
  return Math.max(0, 100 - (meanError / meanActual) * 100);
}

function calculateCurrentCostMetrics(transactions) {
  const itemCosts = {};
  
  transactions.forEach(transaction => {
    const itemId = transaction.itemId;
    if (!itemCosts[itemId]) {
      itemCosts[itemId] = {
        item: transaction.item,
        costs: [],
        quantities: []
      };
    }
    
    itemCosts[itemId].costs.push(parseFloat(transaction.costPerUnit || 0));
    itemCosts[itemId].quantities.push(parseFloat(transaction.quantity));
  });

  return Object.values(itemCosts).map(itemData => {
    const costs = itemData.costs;
    const quantities = itemCosts[itemData.item.id].quantities;
    
    const avgCost = costs.reduce((sum, c) => sum + c, 0) / costs.length;
    const totalQuantity = quantities.reduce((sum, q) => sum + q, 0);
    const costVariance = calculateVariance(costs);
    
    return {
      item: itemData.item,
      averageCost: avgCost,
      totalQuantity,
      costVariance,
      costStability: Math.sqrt(costVariance) / avgCost,
      transactionCount: costs.length
    };
  });
}

function generateBenchmarkData(benchmarkType, currentMetrics) {
  // In real implementation, this would fetch from external benchmark databases
  return currentMetrics.map(metric => ({
    item: metric.item,
    benchmarkCost: metric.averageCost * (0.8 + Math.random() * 0.4), // Simulated benchmark
    benchmarkStability: metric.costStability * (0.5 + Math.random() * 0.5),
    industryAverage: metric.averageCost * (0.9 + Math.random() * 0.2)
  }));
}

function calculatePerformanceVsBenchmark(currentMetrics, benchmarkData) {
  return currentMetrics.map(current => {
    const benchmark = benchmarkData.find(b => b.item.id === current.item.id);
    if (!benchmark) return null;

    const costPerformance = ((current.averageCost - benchmark.benchmarkCost) / benchmark.benchmarkCost) * 100;
    const stabilityPerformance = ((current.costStability - benchmark.benchmarkStability) / benchmark.benchmarkStability) * 100;

    return {
      item: current.item,
      costPerformance,
      stabilityPerformance,
      overallPerformance: (costPerformance + stabilityPerformance) / 2,
      isAboveBenchmark: costPerformance > 0,
      isStable: Math.abs(stabilityPerformance) < 10
    };
  }).filter(Boolean);
}

function generateBenchmarkRecommendations(performanceAnalysis) {
  return performanceAnalysis
    .filter(analysis => analysis.costPerformance > 10 || Math.abs(analysis.stabilityPerformance) > 20)
    .map(analysis => ({
      type: 'BENCHMARK',
      category: analysis.costPerformance > 10 ? 'cost_reduction' : 'cost_stability',
      title: `${analysis.item.name} Performance vs Benchmark`,
      description: `Cost ${analysis.costPerformance > 0 ? 'above' : 'below'} benchmark by ${Math.abs(analysis.costPerformance).toFixed(1)}%`,
      impact: Math.abs(analysis.costPerformance) > 20 ? 'HIGH' : 'MEDIUM',
      potentialSavings: Math.abs(analysis.costPerformance) * 1000,
      recommendation: analysis.costPerformance > 10 
        ? 'Focus on cost reduction strategies'
        : 'Improve cost stability and consistency',
      data: analysis
    }));
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
  generateCostReport,
  // Advanced Analytics Functions
  getCostAnalyticsDashboard,
  getCostOptimizationRecommendations,
  getCostForecast,
  getCostBenchmarking
};
