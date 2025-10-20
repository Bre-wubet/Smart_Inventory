// src/modules/costing/costing-analytics.service.js
const { prisma } = require('../../config/db');
const { ValidationError, NotFoundError } = require('../../core/exceptions');

// Advanced Cost Analytics Service
// This service provides specialized analytics functions for cost management

// Get cost variance analysis
async function getCostVarianceAnalysis(tenantId, options = {}) {
  const { 
    startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    endDate = new Date(),
    itemId,
    category
  } = options;

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

  // Group by item and calculate variance
  const itemVariances = {};
  transactions.forEach(transaction => {
    const itemId = transaction.itemId;
    if (!itemVariances[itemId]) {
      itemVariances[itemId] = {
        item: transaction.item,
        costs: [],
        quantities: [],
        dates: []
      };
    }

    itemVariances[itemId].costs.push(parseFloat(transaction.costPerUnit || 0));
    itemVariances[itemId].quantities.push(parseFloat(transaction.quantity));
    itemVariances[itemId].dates.push(transaction.createdAt);
  });

  const varianceAnalysis = Object.values(itemVariances).map(itemData => {
    const { costs, quantities, dates } = itemData;
    
    if (costs.length < 2) {
      return {
        item: itemData.item,
        variance: 0,
        trend: 'stable',
        recommendation: 'Insufficient data for analysis'
      };
    }

    const meanCost = costs.reduce((sum, cost) => sum + cost, 0) / costs.length;
    const variance = costs.reduce((sum, cost) => sum + Math.pow(cost - meanCost, 2), 0) / costs.length;
    const standardDeviation = Math.sqrt(variance);
    const coefficientOfVariation = (standardDeviation / meanCost) * 100;

    // Calculate trend
    const firstHalf = costs.slice(0, Math.floor(costs.length / 2));
    const secondHalf = costs.slice(Math.floor(costs.length / 2));
    const firstHalfAvg = firstHalf.reduce((sum, cost) => sum + cost, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((sum, cost) => sum + cost, 0) / secondHalf.length;
    
    let trend = 'stable';
    if (secondHalfAvg > firstHalfAvg * 1.05) trend = 'increasing';
    else if (secondHalfAvg < firstHalfAvg * 0.95) trend = 'decreasing';

    // Generate recommendations
    let recommendation = 'Cost variance is within acceptable range';
    if (coefficientOfVariation > 20) {
      recommendation = 'High cost variance detected. Consider supplier diversification or contract negotiations';
    } else if (coefficientOfVariation > 10) {
      recommendation = 'Moderate cost variance. Monitor supplier performance closely';
    }

    return {
      item: itemData.item,
      statistics: {
        meanCost,
        variance,
        standardDeviation,
        coefficientOfVariation,
        minCost: Math.min(...costs),
        maxCost: Math.max(...costs),
        dataPoints: costs.length
      },
      trend,
      recommendation,
      riskLevel: coefficientOfVariation > 20 ? 'HIGH' : coefficientOfVariation > 10 ? 'MEDIUM' : 'LOW'
    };
  });

  // Sort by coefficient of variation (highest variance first)
  varianceAnalysis.sort((a, b) => b.statistics.coefficientOfVariation - a.statistics.coefficientOfVariation);

  return {
    varianceAnalysis,
    summary: {
      totalItems: varianceAnalysis.length,
      highRiskItems: varianceAnalysis.filter(item => item.riskLevel === 'HIGH').length,
      mediumRiskItems: varianceAnalysis.filter(item => item.riskLevel === 'MEDIUM').length,
      lowRiskItems: varianceAnalysis.filter(item => item.riskLevel === 'LOW').length,
      averageVariance: varianceAnalysis.length > 0 
        ? varianceAnalysis.reduce((sum, item) => sum + item.statistics.coefficientOfVariation, 0) / varianceAnalysis.length 
        : 0
    },
    period: { startDate, endDate }
  };
}

// Get cost center analysis
async function getCostCenterAnalysis(tenantId, options = {}) {
  const { 
    startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    endDate = new Date(),
    groupBy = 'category' // category, warehouse, supplier
  } = options;

  const where = {
    item: { tenantId },
    createdAt: { gte: startDate, lte: endDate },
    type: { in: ['PURCHASE', 'ADJUSTMENT'] }
  };

  const transactions = await prisma.inventoryTransaction.findMany({
    where,
    include: {
      item: { select: { id: true, name: true, sku: true, type: true } },
      warehouse: { select: { id: true, name: true, code: true } },
      purchaseOrder: {
        include: {
          supplier: { select: { id: true, name: true } }
        }
      }
    }
  });

  // Group by cost center
  const costCenters = {};
  transactions.forEach(transaction => {
    let centerKey;
    let centerName;
    
    switch (groupBy) {
      case 'category':
        centerKey = transaction.item.type;
        centerName = transaction.item.type;
        break;
      case 'warehouse':
        centerKey = transaction.warehouseId || 'unknown';
        centerName = transaction.warehouse?.name || 'Unknown Warehouse';
        break;
      case 'supplier':
        centerKey = transaction.purchaseOrder?.supplierId || 'unknown';
        centerName = transaction.purchaseOrder?.supplier?.name || 'Unknown Supplier';
        break;
      default:
        centerKey = transaction.item.type;
        centerName = transaction.item.type;
    }

    if (!costCenters[centerKey]) {
      costCenters[centerKey] = {
        centerKey,
        centerName,
        totalCost: 0,
        totalQuantity: 0,
        transactions: 0,
        items: new Set(),
        averageCostPerUnit: 0,
        costDistribution: {}
      };
    }

    const cost = parseFloat(transaction.costPerUnit || 0) * parseFloat(transaction.quantity);
    costCenters[centerKey].totalCost += cost;
    costCenters[centerKey].totalQuantity += parseFloat(transaction.quantity);
    costCenters[centerKey].transactions += 1;
    costCenters[centerKey].items.add(transaction.itemId);

    // Track cost distribution by item
    if (!costCenters[centerKey].costDistribution[transaction.itemId]) {
      costCenters[centerKey].costDistribution[transaction.itemId] = {
        item: transaction.item,
        totalCost: 0,
        totalQuantity: 0
      };
    }
    costCenters[centerKey].costDistribution[transaction.itemId].totalCost += cost;
    costCenters[centerKey].costDistribution[transaction.itemId].totalQuantity += parseFloat(transaction.quantity);
  });

  // Calculate analytics for each cost center
  const costCenterAnalysis = Object.values(costCenters).map(center => {
    const averageCostPerUnit = center.totalQuantity > 0 ? center.totalCost / center.totalQuantity : 0;
    const uniqueItemsCount = center.items.size;
    
    // Calculate cost concentration (how much of the cost comes from top items)
    const itemCosts = Object.values(center.costDistribution)
      .map(item => item.totalCost)
      .sort((a, b) => b - a);
    
    const top20PercentItems = Math.ceil(uniqueItemsCount * 0.2);
    const top20PercentCost = itemCosts.slice(0, top20PercentItems).reduce((sum, cost) => sum + cost, 0);
    const costConcentration = center.totalCost > 0 ? (top20PercentCost / center.totalCost) * 100 : 0;

    return {
      ...center,
      uniqueItemsCount,
      averageCostPerUnit,
      costConcentration,
      costDistribution: Object.values(center.costDistribution)
        .sort((a, b) => b.totalCost - a.totalCost)
        .slice(0, 10), // Top 10 items
      efficiency: center.transactions > 0 ? center.totalCost / center.transactions : 0
    };
  });

  // Sort by total cost (highest cost centers first)
  costCenterAnalysis.sort((a, b) => b.totalCost - a.totalCost);

  // Calculate summary statistics
  const totalCost = costCenterAnalysis.reduce((sum, center) => sum + center.totalCost, 0);
  const summary = {
    totalCostCenters: costCenterAnalysis.length,
    totalCost,
    averageCostPerCenter: costCenterAnalysis.length > 0 ? totalCost / costCenterAnalysis.length : 0,
    topCostCenter: costCenterAnalysis[0] || null,
    costConcentration: costCenterAnalysis.length > 0 
      ? costCenterAnalysis.reduce((sum, center) => sum + center.costConcentration, 0) / costCenterAnalysis.length 
      : 0
  };

  return {
    costCenters: costCenterAnalysis,
    summary,
    groupBy,
    period: { startDate, endDate }
  };
}

// Get cost impact analysis
async function getCostImpactAnalysis(tenantId, options = {}) {
  const { 
    startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    endDate = new Date(),
    impactType = 'profit' // profit, margin, volume
  } = options;

  const where = {
    item: { tenantId },
    createdAt: { gte: startDate, lte: endDate }
  };

  const [purchaseTransactions, saleTransactions] = await Promise.all([
    prisma.inventoryTransaction.findMany({
      where: { ...where, type: { in: ['PURCHASE', 'ADJUSTMENT'] } },
      include: {
        item: { select: { id: true, name: true, sku: true, type: true } }
      }
    }),
    prisma.inventoryTransaction.findMany({
      where: { ...where, type: 'SALE' },
      include: {
        item: { select: { id: true, name: true, sku: true, type: true, price: true } },
        saleOrder: { select: { customer: true } }
      }
    })
  ]);

  // Group by item for impact analysis
  const itemImpacts = {};
  
  // Process purchase transactions
  purchaseTransactions.forEach(transaction => {
    const itemId = transaction.itemId;
    if (!itemImpacts[itemId]) {
      itemImpacts[itemId] = {
        item: transaction.item,
        totalPurchaseCost: 0,
        totalPurchaseQuantity: 0,
        averagePurchaseCost: 0,
        totalSalesRevenue: 0,
        totalSalesQuantity: 0,
        averageSalesPrice: 0,
        customers: new Set()
      };
    }

    itemImpacts[itemId].totalPurchaseCost += parseFloat(transaction.costPerUnit || 0) * parseFloat(transaction.quantity);
    itemImpacts[itemId].totalPurchaseQuantity += parseFloat(transaction.quantity);
  });

  // Process sales transactions
  saleTransactions.forEach(transaction => {
    const itemId = transaction.itemId;
    if (!itemImpacts[itemId]) {
      itemImpacts[itemId] = {
        item: transaction.item,
        totalPurchaseCost: 0,
        totalPurchaseQuantity: 0,
        averagePurchaseCost: 0,
        totalSalesRevenue: 0,
        totalSalesQuantity: 0,
        averageSalesPrice: 0,
        customers: new Set()
      };
    }

    itemImpacts[itemId].totalSalesRevenue += parseFloat(transaction.item.price || 0) * parseFloat(transaction.quantity);
    itemImpacts[itemId].totalSalesQuantity += parseFloat(transaction.quantity);
    itemImpacts[itemId].customers.add(transaction.saleOrder?.customer);
  });

  // Calculate impact metrics
  const impactAnalysis = Object.values(itemImpacts).map(itemData => {
    const averagePurchaseCost = itemData.totalPurchaseQuantity > 0 
      ? itemData.totalPurchaseCost / itemData.totalPurchaseQuantity 
      : 0;
    
    const averageSalesPrice = itemData.totalSalesQuantity > 0 
      ? itemData.totalSalesRevenue / itemData.totalSalesQuantity 
      : 0;

    const totalProfit = itemData.totalSalesRevenue - itemData.totalPurchaseCost;
    const profitMargin = itemData.totalSalesRevenue > 0 
      ? (totalProfit / itemData.totalSalesRevenue) * 100 
      : 0;

    const costImpact = averagePurchaseCost > 0 
      ? ((averageSalesPrice - averagePurchaseCost) / averagePurchaseCost) * 100 
      : 0;

    // Calculate impact score based on impact type
    let impactScore = 0;
    switch (impactType) {
      case 'profit':
        impactScore = totalProfit;
        break;
      case 'margin':
        impactScore = profitMargin;
        break;
      case 'volume':
        impactScore = itemData.totalSalesQuantity;
        break;
      default:
        impactScore = totalProfit;
    }

    return {
      item: itemData.item,
      metrics: {
        totalPurchaseCost: itemData.totalPurchaseCost,
        totalSalesRevenue: itemData.totalSalesRevenue,
        totalProfit,
        profitMargin,
        costImpact,
        averagePurchaseCost,
        averageSalesPrice,
        totalSalesQuantity: itemData.totalSalesQuantity,
        uniqueCustomers: itemData.customers.size
      },
      impactScore,
      impactLevel: impactScore > 10000 ? 'HIGH' : impactScore > 1000 ? 'MEDIUM' : 'LOW'
    };
  });

  // Sort by impact score
  impactAnalysis.sort((a, b) => b.impactScore - a.impactScore);

  // Calculate summary
  const summary = {
    totalItems: impactAnalysis.length,
    totalProfit: impactAnalysis.reduce((sum, item) => sum + item.metrics.totalProfit, 0),
    totalRevenue: impactAnalysis.reduce((sum, item) => sum + item.metrics.totalSalesRevenue, 0),
    totalCost: impactAnalysis.reduce((sum, item) => sum + item.metrics.totalPurchaseCost, 0),
    averageProfitMargin: impactAnalysis.length > 0 
      ? impactAnalysis.reduce((sum, item) => sum + item.metrics.profitMargin, 0) / impactAnalysis.length 
      : 0,
    highImpactItems: impactAnalysis.filter(item => item.impactLevel === 'HIGH').length,
    mediumImpactItems: impactAnalysis.filter(item => item.impactLevel === 'MEDIUM').length,
    lowImpactItems: impactAnalysis.filter(item => item.impactLevel === 'LOW').length
  };

  return {
    impactAnalysis,
    summary,
    impactType,
    period: { startDate, endDate }
  };
}

// Get cost optimization opportunities
async function getCostOptimizationOpportunities(tenantId, options = {}) {
  const { 
    startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    endDate = new Date(),
    opportunityType = 'all' // all, supplier, volume, efficiency
  } = options;

  const opportunities = [];

  // Supplier optimization opportunities
  if (opportunityType === 'all' || opportunityType === 'supplier') {
    const supplierOpportunities = await analyzeSupplierOptimization(tenantId, startDate, endDate);
    opportunities.push(...supplierOpportunities);
  }

  // Volume optimization opportunities
  if (opportunityType === 'all' || opportunityType === 'volume') {
    const volumeOpportunities = await analyzeVolumeOptimization(tenantId, startDate, endDate);
    opportunities.push(...volumeOpportunities);
  }

  // Efficiency optimization opportunities
  if (opportunityType === 'all' || opportunityType === 'efficiency') {
    const efficiencyOpportunities = await analyzeEfficiencyOptimization(tenantId, startDate, endDate);
    opportunities.push(...efficiencyOpportunities);
  }

  // Sort by potential savings
  opportunities.sort((a, b) => b.potentialSavings - a.potentialSavings);

  return {
    opportunities,
    summary: {
      totalOpportunities: opportunities.length,
      totalPotentialSavings: opportunities.reduce((sum, opp) => sum + opp.potentialSavings, 0),
      highImpactOpportunities: opportunities.filter(opp => opp.impact === 'HIGH').length,
      mediumImpactOpportunities: opportunities.filter(opp => opp.impact === 'MEDIUM').length,
      lowImpactOpportunities: opportunities.filter(opp => opp.impact === 'LOW').length
    },
    period: { startDate, endDate }
  };
}

// Helper functions for optimization analysis
async function analyzeSupplierOptimization(tenantId, startDate, endDate) {
  const opportunities = [];
  
  const itemSuppliers = await prisma.itemSupplier.findMany({
    where: {
      item: { tenantId }
    },
    include: {
      item: { select: { id: true, name: true, sku: true } },
      supplier: { select: { id: true, name: true, rating: true } }
    }
  });

  // Group by item
  const itemSupplierGroups = {};
  itemSuppliers.forEach(itemSupplier => {
    const itemId = itemSupplier.itemId;
    if (!itemSupplierGroups[itemId]) {
      itemSupplierGroups[itemId] = [];
    }
    itemSupplierGroups[itemId].push(itemSupplier);
  });

  Object.entries(itemSupplierGroups).forEach(([itemId, suppliers]) => {
    if (suppliers.length > 1) {
      const costs = suppliers.map(s => parseFloat(s.cost));
      const minCost = Math.min(...costs);
      const maxCost = Math.max(...costs);
      const costDifference = maxCost - minCost;
      const costSavingsPercentage = (costDifference / maxCost) * 100;

      if (costSavingsPercentage > 10) {
        const cheapestSupplier = suppliers.find(s => parseFloat(s.cost) === minCost);
        const expensiveSupplier = suppliers.find(s => parseFloat(s.cost) === maxCost);
        
        opportunities.push({
          type: 'SUPPLIER',
          category: 'cost_reduction',
          title: `Supplier Cost Optimization: ${suppliers[0].item.name}`,
          description: `Potential savings of ${costSavingsPercentage.toFixed(1)}% by switching suppliers`,
          impact: costSavingsPercentage > 25 ? 'HIGH' : costSavingsPercentage > 15 ? 'MEDIUM' : 'LOW',
          potentialSavings: costDifference * 1000, // Assuming 1000 units
          recommendation: `Consider switching from ${expensiveSupplier.supplier.name} to ${cheapestSupplier.supplier.name}`,
          data: {
            item: suppliers[0].item,
            currentSupplier: expensiveSupplier.supplier,
            recommendedSupplier: cheapestSupplier.supplier,
            currentCost: maxCost,
            recommendedCost: minCost,
            costSavingsPercentage
          }
        });
      }
    }
  });

  return opportunities;
}

async function analyzeVolumeOptimization(tenantId, startDate, endDate) {
  const opportunities = [];
  
  const transactions = await prisma.inventoryTransaction.findMany({
    where: {
      item: { tenantId },
      createdAt: { gte: startDate, lte: endDate },
      type: { in: ['PURCHASE', 'ADJUSTMENT'] }
    },
    include: {
      item: { select: { id: true, name: true, sku: true } }
    }
  });

  // Group by item and analyze purchase patterns
  const itemPurchases = {};
  transactions.forEach(transaction => {
    const itemId = transaction.itemId;
    if (!itemPurchases[itemId]) {
      itemPurchases[itemId] = {
        item: transaction.item,
        purchases: [],
        totalQuantity: 0,
        totalCost: 0
      };
    }

    itemPurchases[itemId].purchases.push({
      quantity: parseFloat(transaction.quantity),
      cost: parseFloat(transaction.costPerUnit || 0),
      date: transaction.createdAt
    });
    itemPurchases[itemId].totalQuantity += parseFloat(transaction.quantity);
    itemPurchases[itemId].totalCost += parseFloat(transaction.costPerUnit || 0) * parseFloat(transaction.quantity);
  });

  Object.values(itemPurchases).forEach(itemData => {
    if (itemData.purchases.length > 3) {
      const averageQuantity = itemData.totalQuantity / itemData.purchases.length;
      const averageCost = itemData.totalCost / itemData.totalQuantity;
      
      // Find opportunities for bulk purchasing
      const smallPurchases = itemData.purchases.filter(p => p.quantity < averageQuantity * 0.5);
      const largePurchases = itemData.purchases.filter(p => p.quantity > averageQuantity * 1.5);
      
      if (smallPurchases.length > 2 && largePurchases.length > 0) {
        const smallPurchaseCost = smallPurchases.reduce((sum, p) => sum + p.cost, 0) / smallPurchases.length;
        const largePurchaseCost = largePurchases.reduce((sum, p) => sum + p.cost, 0) / largePurchases.length;
        const costDifference = smallPurchaseCost - largePurchaseCost;
        
        if (costDifference > 0) {
          opportunities.push({
            type: 'VOLUME',
            category: 'bulk_purchasing',
            title: `Bulk Purchase Opportunity: ${itemData.item.name}`,
            description: `Potential savings of ${(costDifference / smallPurchaseCost * 100).toFixed(1)}% through bulk purchasing`,
            impact: costDifference > smallPurchaseCost * 0.1 ? 'HIGH' : 'MEDIUM',
            potentialSavings: costDifference * itemData.totalQuantity,
            recommendation: 'Consider consolidating small purchases into larger bulk orders',
            data: {
              item: itemData.item,
              averageQuantity,
              smallPurchaseCost,
              largePurchaseCost,
              costDifference,
              smallPurchaseCount: smallPurchases.length,
              largePurchaseCount: largePurchases.length
            }
          });
        }
      }
    }
  });

  return opportunities;
}

async function analyzeEfficiencyOptimization(tenantId, startDate, endDate) {
  const opportunities = [];
  
  // Analyze transaction patterns for efficiency opportunities
  const transactions = await prisma.inventoryTransaction.findMany({
    where: {
      item: { tenantId },
      createdAt: { gte: startDate, lte: endDate },
      type: { in: ['PURCHASE', 'ADJUSTMENT'] }
    },
    include: {
      item: { select: { id: true, name: true, sku: true, type: true } }
    }
  });

  // Group by category and analyze efficiency
  const categoryAnalysis = {};
  transactions.forEach(transaction => {
    const category = transaction.item.type;
    if (!categoryAnalysis[category]) {
      categoryAnalysis[category] = {
        category,
        transactions: [],
        totalCost: 0,
        totalQuantity: 0
      };
    }

    categoryAnalysis[category].transactions.push(transaction);
    categoryAnalysis[category].totalCost += parseFloat(transaction.costPerUnit || 0) * parseFloat(transaction.quantity);
    categoryAnalysis[category].totalQuantity += parseFloat(transaction.quantity);
  });

  Object.values(categoryAnalysis).forEach(categoryData => {
    if (categoryData.transactions.length > 10) {
      const averageCostPerTransaction = categoryData.totalCost / categoryData.transactions.length;
      const averageQuantityPerTransaction = categoryData.totalQuantity / categoryData.transactions.length;
      
      // Look for efficiency opportunities
      const smallTransactions = categoryData.transactions.filter(t => 
        parseFloat(t.quantity) < averageQuantityPerTransaction * 0.3
      );
      
      if (smallTransactions.length > categoryData.transactions.length * 0.3) {
        opportunities.push({
          type: 'EFFICIENCY',
          category: 'transaction_consolidation',
          title: `Transaction Consolidation: ${categoryData.category}`,
          description: `${smallTransactions.length} small transactions could be consolidated`,
          impact: smallTransactions.length > categoryData.transactions.length * 0.5 ? 'HIGH' : 'MEDIUM',
          potentialSavings: averageCostPerTransaction * smallTransactions.length * 0.1, // 10% efficiency gain
          recommendation: 'Consider consolidating small transactions to reduce processing costs',
          data: {
            category: categoryData.category,
            totalTransactions: categoryData.transactions.length,
            smallTransactions: smallTransactions.length,
            averageCostPerTransaction,
            consolidationPotential: (smallTransactions.length / categoryData.transactions.length) * 100
          }
        });
      }
    }
  });

  return opportunities;
}

module.exports = {
  getCostVarianceAnalysis,
  getCostCenterAnalysis,
  getCostImpactAnalysis,
  getCostOptimizationOpportunities
};
