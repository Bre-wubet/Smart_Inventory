const { prisma } = require('../../config/db');
const { ValidationError, NotFoundError } = require('../../core/exceptions');
const { POStatus, TransactionType } = require('../../core/constants');

async function getPurchaseOptimization(tenantId, options = {}) {
  const { period = 90, focusArea = 'ALL' } = options;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);

  // Get purchase data for analysis
  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: {
      tenantId,
      createdAt: { gte: startDate },
      status: { in: [POStatus.RECEIVED, POStatus.PARTIALLY_RECEIVED] }
    },
    include: {
      supplier: {
        select: { id: true, name: true, contact: true, email: true }
      },
      items: {
        include: {
          item: {
            select: { id: true, name: true, sku: true, type: true, unit: true, cost: true }
          }
        }
      }
    }
  });

  // Get supplier cost data
  const itemSuppliers = await prisma.itemSupplier.findMany({
    where: {
      item: { tenantId }
    },
    include: {
      item: {
        select: { id: true, name: true, sku: true, type: true, unit: true }
      },
      supplier: {
        select: { id: true, name: true, contact: true }
      }
    }
  });

  const recommendations = {
    costOptimization: await getCostOptimizationRecommendations(purchaseOrders, itemSuppliers),
    supplierOptimization: await getSupplierOptimizationRecommendations(purchaseOrders, itemSuppliers),
    volumeOptimization: await getVolumeOptimizationRecommendations(purchaseOrders, itemSuppliers),
    timingOptimization: await getTimingOptimizationRecommendations(purchaseOrders),
    consolidationOpportunities: await getConsolidationOpportunities(purchaseOrders, itemSuppliers)
  };

  return {
    period,
    focusArea,
    recommendations,
    summary: {
      totalRecommendations: Object.values(recommendations).reduce((sum, recs) => sum + recs.length, 0),
      potentialSavings: calculatePotentialSavings(recommendations),
      implementationPriority: prioritizeRecommendations(recommendations)
    }
  };
}

async function getCostOptimizationRecommendations(purchaseOrders, itemSuppliers) {
  const recommendations = [];

  // Analyze cost variations for same items across suppliers
  const itemCostAnalysis = itemSuppliers.reduce((acc, itemSupplier) => {
    const itemId = itemSupplier.item.id;
    if (!acc[itemId]) {
      acc[itemId] = {
        item: itemSupplier.item,
        suppliers: [],
        costRange: { min: Infinity, max: 0 },
        averageCost: 0
      };
    }

    acc[itemId].suppliers.push({
      supplier: itemSupplier.supplier,
      cost: parseFloat(itemSupplier.cost),
      leadTime: itemSupplier.leadTime
    });

    acc[itemId].costRange.min = Math.min(acc[itemId].costRange.min, parseFloat(itemSupplier.cost));
    acc[itemId].costRange.max = Math.max(acc[itemId].costRange.max, parseFloat(itemSupplier.cost));

    return acc;
  }, {});

  // Calculate average costs and identify optimization opportunities
  Object.keys(itemCostAnalysis).forEach(itemId => {
    const analysis = itemCostAnalysis[itemId];
    const costs = analysis.suppliers.map(s => s.cost);
    analysis.averageCost = costs.reduce((sum, cost) => sum + cost, 0) / costs.length;

    // Find cost variation opportunities
    const costVariation = analysis.costRange.max - analysis.costRange.min;
    const costVariationPercentage = (costVariation / analysis.averageCost) * 100;

    if (costVariationPercentage > 10 && analysis.suppliers.length > 1) {
      const cheapestSupplier = analysis.suppliers.reduce((min, supplier) => 
        supplier.cost < min.cost ? supplier : min
      );
      const mostExpensiveSupplier = analysis.suppliers.reduce((max, supplier) => 
        supplier.cost > max.cost ? supplier : max
      );

      recommendations.push({
        type: 'COST_REDUCTION',
        priority: costVariationPercentage > 25 ? 'HIGH' : costVariationPercentage > 15 ? 'MEDIUM' : 'LOW',
        item: analysis.item,
        currentSupplier: mostExpensiveSupplier.supplier,
        recommendedSupplier: cheapestSupplier.supplier,
        currentCost: mostExpensiveSupplier.cost,
        recommendedCost: cheapestSupplier.cost,
        potentialSavings: mostExpensiveSupplier.cost - cheapestSupplier.cost,
        savingsPercentage: costVariationPercentage,
        description: `Switch from ${mostExpensiveSupplier.supplier.name} to ${cheapestSupplier.supplier.name} for ${analysis.item.name}`,
        impact: 'Cost reduction'
      });
    }
  });

  return recommendations.sort((a, b) => b.potentialSavings - a.potentialSavings);
}

async function getSupplierOptimizationRecommendations(purchaseOrders, itemSuppliers) {
  const recommendations = [];

  // Analyze supplier performance
  const supplierPerformance = purchaseOrders.reduce((acc, po) => {
    const supplierName = po.supplier.name;
    if (!acc[supplierName]) {
      acc[supplierName] = {
        supplier: po.supplier,
        totalOrders: 0,
        totalValue: 0,
        averageOrderValue: 0,
        deliveryPerformance: [],
        items: new Set()
      };
    }

    acc[supplierName].totalOrders++;
    const orderValue = po.items.reduce((sum, item) => 
      sum + (parseFloat(item.quantity) * parseFloat(item.unitCost)), 0
    );
    acc[supplierName].totalValue += orderValue;

    po.items.forEach(item => {
      acc[supplierName].items.add(item.item.id);
    });

    // Calculate delivery performance
    if (po.expectedAt) {
      const deliveryTime = po.updatedAt.getTime() - po.createdAt.getTime();
      const expectedTime = po.expectedAt.getTime() - po.createdAt.getTime();
      const performance = deliveryTime <= expectedTime ? 'ON_TIME' : 'LATE';
      acc[supplierName].deliveryPerformance.push(performance);
    }

    return acc;
  }, {});

  // Calculate performance metrics
  Object.keys(supplierPerformance).forEach(supplierName => {
    const supplier = supplierPerformance[supplierName];
    supplier.averageOrderValue = supplier.totalValue / supplier.totalOrders;
    supplier.itemCount = supplier.items.size;
    supplier.onTimeDeliveryRate = supplier.deliveryPerformance.length > 0 
      ? (supplier.deliveryPerformance.filter(p => p === 'ON_TIME').length / supplier.deliveryPerformance.length) * 100
      : 0;

    // Identify consolidation opportunities
    if (supplier.totalOrders < 3 && supplier.totalValue < 1000) {
      recommendations.push({
        type: 'SUPPLIER_CONSOLIDATION',
        priority: 'MEDIUM',
        supplier: supplier.supplier,
        currentOrders: supplier.totalOrders,
        currentValue: supplier.totalValue,
        recommendation: 'Consider consolidating with primary suppliers',
        description: `Low volume supplier ${supplier.supplier.name} with only ${supplier.totalOrders} orders`,
        impact: 'Reduced complexity and better pricing through volume'
      });
    }

    // Identify high-performing suppliers for expansion
    if (supplier.onTimeDeliveryRate > 90 && supplier.totalOrders > 5) {
      recommendations.push({
        type: 'SUPPLIER_EXPANSION',
        priority: 'LOW',
        supplier: supplier.supplier,
        performance: supplier.onTimeDeliveryRate,
        recommendation: 'Consider expanding business with this reliable supplier',
        description: `${supplier.supplier.name} has ${supplier.onTimeDeliveryRate.toFixed(1)}% on-time delivery rate`,
        impact: 'Improved reliability and potentially better terms'
      });
    }
  });

  return recommendations;
}

async function getVolumeOptimizationRecommendations(purchaseOrders, itemSuppliers) {
  const recommendations = [];

  // Analyze purchase patterns by item
  const itemPurchasePatterns = purchaseOrders.reduce((acc, po) => {
    po.items.forEach(item => {
      const itemId = item.item.id;
      if (!acc[itemId]) {
        acc[itemId] = {
          item: item.item,
          purchases: [],
          totalQuantity: 0,
          totalValue: 0,
          suppliers: new Set()
        };
      }

      acc[itemId].purchases.push({
        quantity: parseFloat(item.quantity),
        unitCost: parseFloat(item.unitCost),
        supplier: po.supplier.name,
        date: po.createdAt
      });

      acc[itemId].totalQuantity += parseFloat(item.quantity);
      acc[itemId].totalValue += parseFloat(item.quantity) * parseFloat(item.unitCost);
      acc[itemId].suppliers.add(po.supplier.name);
    });
    return acc;
  }, {});

  // Analyze patterns and identify optimization opportunities
  Object.keys(itemPurchasePatterns).forEach(itemId => {
    const pattern = itemPurchasePatterns[itemId];
    pattern.supplierCount = pattern.suppliers.size;
    pattern.averageOrderSize = pattern.totalQuantity / pattern.purchases.length;
    pattern.averageOrderValue = pattern.totalValue / pattern.purchases.length;

    // Identify frequent small orders that could be consolidated
    const smallOrders = pattern.purchases.filter(p => p.quantity < pattern.averageOrderSize * 0.5);
    if (smallOrders.length > 3) {
      const consolidationSavings = smallOrders.reduce((sum, order) => 
        sum + (order.quantity * order.unitCost * 0.1), 0 // Assume 10% savings from consolidation
      );

      recommendations.push({
        type: 'VOLUME_CONSOLIDATION',
        priority: 'MEDIUM',
        item: pattern.item,
        smallOrders: smallOrders.length,
        averageOrderSize: pattern.averageOrderSize,
        potentialSavings: consolidationSavings,
        recommendation: 'Consolidate frequent small orders into larger batches',
        description: `${pattern.item.name} has ${smallOrders.length} small orders that could be consolidated`,
        impact: 'Reduced ordering costs and potentially better pricing'
      });
    }

    // Identify items with multiple suppliers that could be consolidated
    if (pattern.supplierCount > 2) {
      recommendations.push({
        type: 'SUPPLIER_CONSOLIDATION',
        priority: 'LOW',
        item: pattern.item,
        supplierCount: pattern.supplierCount,
        recommendation: 'Consider consolidating suppliers for this item',
        description: `${pattern.item.name} is purchased from ${pattern.supplierCount} different suppliers`,
        impact: 'Simplified management and potentially better volume pricing'
      });
    }
  });

  return recommendations;
}

async function getTimingOptimizationRecommendations(purchaseOrders) {
  const recommendations = [];

  // Analyze seasonal patterns
  const monthlyPatterns = purchaseOrders.reduce((acc, po) => {
    const month = po.createdAt.getMonth();
    if (!acc[month]) {
      acc[month] = {
        month: month + 1,
        orders: 0,
        value: 0,
        items: new Set()
      };
    }

    acc[month].orders++;
    acc[month].value += po.items.reduce((sum, item) => 
      sum + (parseFloat(item.quantity) * parseFloat(item.unitCost)), 0
    );

    po.items.forEach(item => {
      acc[month].items.add(item.item.id);
    });

    return acc;
  }, {});

  // Calculate seasonal variations
  const monthlyData = Object.values(monthlyPatterns);
  const averageValue = monthlyData.reduce((sum, month) => sum + month.value, 0) / monthlyData.length;

  monthlyData.forEach(month => {
    const variation = ((month.value - averageValue) / averageValue) * 100;
    
    if (Math.abs(variation) > 30) {
      recommendations.push({
        type: 'TIMING_OPTIMIZATION',
        priority: variation > 0 ? 'LOW' : 'MEDIUM',
        month: month.month,
        variation: variation,
        recommendation: variation > 0 
          ? 'Consider advance purchasing to avoid peak season'
          : 'Consider increasing purchases during low-demand period',
        description: `Month ${month.month} shows ${variation > 0 ? 'high' : 'low'} demand (${variation.toFixed(1)}% variation)`,
        impact: variation > 0 ? 'Cost avoidance' : 'Better pricing opportunities'
      });
    }
  });

  return recommendations;
}

async function getConsolidationOpportunities(purchaseOrders, itemSuppliers) {
  const recommendations = [];

  // Analyze supplier relationships
  const supplierItems = itemSuppliers.reduce((acc, itemSupplier) => {
    const supplierName = itemSupplier.supplier.name;
    if (!acc[supplierName]) {
      acc[supplierName] = {
        supplier: itemSupplier.supplier,
        items: [],
        totalItems: 0
      };
    }

    acc[supplierName].items.push({
      item: itemSupplier.item,
      cost: parseFloat(itemSupplier.cost),
      leadTime: itemSupplier.leadTime
    });

    acc[supplierName].totalItems++;

    return acc;
  }, {});

  // Find suppliers with overlapping item portfolios
  const suppliers = Object.keys(supplierItems);
  for (let i = 0; i < suppliers.length; i++) {
    for (let j = i + 1; j < suppliers.length; j++) {
      const supplier1 = supplierItems[suppliers[i]];
      const supplier2 = supplierItems[suppliers[j]];

      const commonItems = supplier1.items.filter(item1 =>
        supplier2.items.some(item2 => item2.item.id === item1.item.id)
      );

      if (commonItems.length > 0) {
        const overlapPercentage = (commonItems.length / Math.min(supplier1.totalItems, supplier2.totalItems)) * 100;

        if (overlapPercentage > 50) {
          recommendations.push({
            type: 'SUPPLIER_CONSOLIDATION',
            priority: 'MEDIUM',
            supplier1: supplier1.supplier,
            supplier2: supplier2.supplier,
            commonItems: commonItems.length,
            overlapPercentage: overlapPercentage,
            recommendation: 'Consider consolidating suppliers with high item overlap',
            description: `${supplier1.supplier.name} and ${supplier2.supplier.name} have ${overlapPercentage.toFixed(1)}% item overlap`,
            impact: 'Simplified supplier management and potentially better terms'
          });
        }
      }
    }
  }

  return recommendations;
}

function calculatePotentialSavings(recommendations) {
  const savings = {
    costReduction: 0,
    volumeOptimization: 0,
    timingOptimization: 0,
    total: 0
  };

  // Calculate cost reduction savings
  recommendations.costOptimization.forEach(rec => {
    if (rec.type === 'COST_REDUCTION') {
      savings.costReduction += rec.potentialSavings || 0;
    }
  });

  // Calculate volume optimization savings
  recommendations.volumeOptimization.forEach(rec => {
    if (rec.type === 'VOLUME_CONSOLIDATION') {
      savings.volumeOptimization += rec.potentialSavings || 0;
    }
  });

  // Calculate timing optimization savings (estimated)
  recommendations.timingOptimization.forEach(rec => {
    if (rec.type === 'TIMING_OPTIMIZATION') {
      savings.timingOptimization += Math.abs(rec.variation) * 100; // Estimated savings
    }
  });

  savings.total = savings.costReduction + savings.volumeOptimization + savings.timingOptimization;

  return savings;
}

function prioritizeRecommendations(recommendations) {
  const allRecommendations = [
    ...recommendations.costOptimization,
    ...recommendations.supplierOptimization,
    ...recommendations.volumeOptimization,
    ...recommendations.timingOptimization,
    ...recommendations.consolidationOpportunities
  ];

  // Sort by priority and potential impact
  return allRecommendations.sort((a, b) => {
    const priorityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
    
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    // If same priority, sort by potential savings
    return (b.potentialSavings || 0) - (a.potentialSavings || 0);
  });
}

async function getPOOptimizationSuggestions(purchaseOrderId, tenantId) {
  const purchaseOrder = await prisma.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, tenantId },
    include: {
      supplier: {
        select: { id: true, name: true, contact: true }
      },
      items: {
        include: {
          item: {
            select: { id: true, name: true, sku: true, type: true, unit: true, cost: true }
          }
        }
      }
    }
  });

  if (!purchaseOrder) {
    throw new NotFoundError('Purchase order not found');
  }

  const suggestions = [];

  // Check for alternative suppliers with better pricing
  for (const poItem of purchaseOrder.items) {
    const alternativeSuppliers = await prisma.itemSupplier.findMany({
      where: {
        itemId: poItem.itemId,
        supplierId: { not: purchaseOrder.supplierId }
      },
      include: {
        supplier: {
          select: { id: true, name: true, contact: true }
        }
      }
    });

    const cheaperAlternatives = alternativeSuppliers.filter(alt => 
      parseFloat(alt.cost) < parseFloat(poItem.unitCost)
    );

    if (cheaperAlternatives.length > 0) {
      const cheapest = cheaperAlternatives.reduce((min, alt) => 
        parseFloat(alt.cost) < parseFloat(min.cost) ? alt : min
      );

      const savings = (parseFloat(poItem.unitCost) - parseFloat(cheapest.cost)) * parseFloat(poItem.quantity);

      suggestions.push({
        type: 'COST_OPTIMIZATION',
        item: poItem.item,
        currentSupplier: purchaseOrder.supplier,
        alternativeSupplier: cheapest.supplier,
        currentCost: parseFloat(poItem.unitCost),
        alternativeCost: parseFloat(cheapest.cost),
        quantity: parseFloat(poItem.quantity),
        potentialSavings: savings,
        savingsPercentage: ((parseFloat(poItem.unitCost) - parseFloat(cheapest.cost)) / parseFloat(poItem.unitCost)) * 100,
        description: `Switch ${poItem.item.name} to ${cheapest.supplier.name} for ${savings.toFixed(2)} savings`
      });
    }
  }

  // Check for volume discounts
  const totalValue = purchaseOrder.items.reduce((sum, item) => 
    sum + (parseFloat(item.quantity) * parseFloat(item.unitCost)), 0
  );

  if (totalValue > 10000) {
    suggestions.push({
      type: 'VOLUME_DISCOUNT',
      currentValue: totalValue,
      recommendation: 'Consider negotiating volume discounts',
      description: `Purchase order value of ${totalValue.toFixed(2)} qualifies for volume discount negotiations`,
      potentialSavings: totalValue * 0.05, // Assume 5% potential discount
      impact: 'Cost reduction through volume pricing'
    });
  }

  return {
    purchaseOrder: {
      id: purchaseOrder.id,
      reference: purchaseOrder.reference,
      supplier: purchaseOrder.supplier,
      totalValue
    },
    suggestions,
    summary: {
      totalSuggestions: suggestions.length,
      potentialSavings: suggestions.reduce((sum, s) => sum + (s.potentialSavings || 0), 0),
      highImpactSuggestions: suggestions.filter(s => s.savingsPercentage > 10).length
    }
  };
}

module.exports = {
  getPurchaseOptimization,
  getPOOptimizationSuggestions
};
