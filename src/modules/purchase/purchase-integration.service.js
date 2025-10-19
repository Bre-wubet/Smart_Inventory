const { prisma } = require('../../config/db');
const { ValidationError, NotFoundError } = require('../../core/exceptions');
const { POStatus, TransactionType } = require('../../core/constants');

async function getSupplierPerformanceAnalysis(tenantId, options = {}) {
  const { period = 90, supplierId } = options;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);

  const where = {
    tenantId,
    createdAt: { gte: startDate },
    ...(supplierId && { supplierId })
  };

  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where,
    include: {
      supplier: {
        select: { id: true, name: true, contact: true, email: true, phone: true }
      },
      items: {
        include: {
          item: {
            select: { id: true, name: true, sku: true, type: true, unit: true }
          }
        }
      }
    }
  });

  // Calculate supplier performance metrics
  const supplierMetrics = purchaseOrders.reduce((acc, po) => {
    const supplierName = po.supplier.name;
    if (!acc[supplierName]) {
      acc[supplierName] = {
        supplier: po.supplier,
        totalOrders: 0,
        totalValue: 0,
        totalItems: 0,
        deliveryPerformance: [],
        costAnalysis: [],
        qualityMetrics: {
          onTimeDeliveries: 0,
          lateDeliveries: 0,
          partialDeliveries: 0,
          completeDeliveries: 0
        }
      };
    }

    const orderValue = po.items.reduce((sum, item) => 
      sum + (parseFloat(item.quantity) * parseFloat(item.unitCost)), 0
    );

    acc[supplierName].totalOrders++;
    acc[supplierName].totalValue += orderValue;
    acc[supplierName].totalItems += po.items.length;

    // Delivery performance analysis
    if (po.expectedAt) {
      const deliveryTime = po.updatedAt.getTime() - po.createdAt.getTime();
      const expectedTime = po.expectedAt.getTime() - po.createdAt.getTime();
      const performance = deliveryTime <= expectedTime ? 'ON_TIME' : 'LATE';
      
      acc[supplierName].deliveryPerformance.push({
        orderId: po.id,
        expectedAt: po.expectedAt,
        deliveredAt: po.updatedAt,
        performance,
        delayDays: performance === 'LATE' ? Math.ceil((deliveryTime - expectedTime) / (1000 * 60 * 60 * 24)) : 0
      });

      if (performance === 'ON_TIME') {
        acc[supplierName].qualityMetrics.onTimeDeliveries++;
      } else {
        acc[supplierName].qualityMetrics.lateDeliveries++;
      }
    }

    // Status analysis
    if (po.status === POStatus.PARTIALLY_RECEIVED) {
      acc[supplierName].qualityMetrics.partialDeliveries++;
    } else if (po.status === POStatus.RECEIVED) {
      acc[supplierName].qualityMetrics.completeDeliveries++;
    }

    // Cost analysis
    po.items.forEach(item => {
      acc[supplierName].costAnalysis.push({
        item: item.item,
        unitCost: parseFloat(item.unitCost),
        quantity: parseFloat(item.quantity),
        totalCost: parseFloat(item.quantity) * parseFloat(item.unitCost)
      });
    });

    return acc;
  }, {});

  // Calculate performance scores
  const performanceAnalysis = Object.keys(supplierMetrics).map(supplierName => {
    const metrics = supplierMetrics[supplierName];
    const totalDeliveries = metrics.qualityMetrics.onTimeDeliveries + metrics.qualityMetrics.lateDeliveries;
    
    const onTimeDeliveryRate = totalDeliveries > 0 
      ? (metrics.qualityMetrics.onTimeDeliveries / totalDeliveries) * 100 
      : 0;

    const averageOrderValue = metrics.totalOrders > 0 ? metrics.totalValue / metrics.totalOrders : 0;
    const averageItemsPerOrder = metrics.totalOrders > 0 ? metrics.totalItems / metrics.totalOrders : 0;

    // Calculate cost competitiveness
    const averageCost = metrics.costAnalysis.length > 0 
      ? metrics.costAnalysis.reduce((sum, item) => sum + item.unitCost, 0) / metrics.costAnalysis.length
      : 0;

    // Calculate performance score (0-100)
    const performanceScore = Math.min(100, 
      (onTimeDeliveryRate * 0.4) + 
      (Math.min(100, (metrics.qualityMetrics.completeDeliveries / metrics.totalOrders) * 100) * 0.3) +
      (Math.min(100, averageOrderValue / 1000) * 0.3)
    );

    return {
      ...metrics,
      performanceMetrics: {
        onTimeDeliveryRate,
        averageOrderValue,
        averageItemsPerOrder,
        averageCost,
        performanceScore,
        totalDeliveries
      }
    };
  });

  return {
    period,
    analysis: performanceAnalysis.sort((a, b) => b.performanceMetrics.performanceScore - a.performanceMetrics.performanceScore),
    summary: {
      totalSuppliers: performanceAnalysis.length,
      averagePerformanceScore: performanceAnalysis.reduce((sum, s) => sum + s.performanceMetrics.performanceScore, 0) / performanceAnalysis.length,
      topPerformers: performanceAnalysis.filter(s => s.performanceMetrics.performanceScore > 80).length,
      underPerformers: performanceAnalysis.filter(s => s.performanceMetrics.performanceScore < 60).length
    }
  };
}

async function getSupplierCostComparison(tenantId, options = {}) {
  const { itemId, itemType, period = 90 } = options;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);

  // Get item supplier relationships
  const where = {
    item: { tenantId },
    ...(itemId && { itemId }),
    ...(itemType && { item: { type: itemType } })
  };

  const itemSuppliers = await prisma.itemSupplier.findMany({
    where,
    include: {
      item: {
        select: { id: true, name: true, sku: true, type: true, unit: true, cost: true }
      },
      supplier: {
        select: { id: true, name: true, contact: true, email: true }
      }
    }
  });

  // Get purchase history for these items
  const itemIds = itemSuppliers.map(is => is.itemId);
  const purchaseHistory = await prisma.purchaseOrder.findMany({
    where: {
      tenantId,
      createdAt: { gte: startDate },
      items: {
        some: { itemId: { in: itemIds } }
      }
    },
    include: {
      supplier: {
        select: { id: true, name: true }
      },
      items: {
        where: { itemId: { in: itemIds } },
        include: {
          item: {
            select: { id: true, name: true, sku: true }
          }
        }
      }
    }
  });

  // Build cost comparison matrix
  const costComparison = itemSuppliers.reduce((acc, itemSupplier) => {
    const itemKey = `${itemSupplier.item.id}-${itemSupplier.item.name}`;
    if (!acc[itemKey]) {
      acc[itemKey] = {
        item: itemSupplier.item,
        suppliers: [],
        costRange: { min: Infinity, max: 0 },
        averageCost: 0,
        purchaseHistory: []
      };
    }

    acc[itemKey].suppliers.push({
      supplier: itemSupplier.supplier,
      cost: parseFloat(itemSupplier.cost),
      leadTime: itemSupplier.leadTime,
      currency: itemSupplier.currency
    });

    acc[itemKey].costRange.min = Math.min(acc[itemKey].costRange.min, parseFloat(itemSupplier.cost));
    acc[itemKey].costRange.max = Math.max(acc[itemKey].costRange.max, parseFloat(itemSupplier.cost));

    return acc;
  }, {});

  // Add purchase history data
  purchaseHistory.forEach(po => {
    po.items.forEach(poItem => {
      const itemKey = `${poItem.item.id}-${poItem.item.name}`;
      if (costComparison[itemKey]) {
        costComparison[itemKey].purchaseHistory.push({
          supplier: po.supplier,
          quantity: parseFloat(poItem.quantity),
          unitCost: parseFloat(poItem.unitCost),
          date: po.createdAt,
          orderId: po.id
        });
      }
    });
  });

  // Calculate metrics for each item
  Object.keys(costComparison).forEach(itemKey => {
    const item = costComparison[itemKey];
    const costs = item.suppliers.map(s => s.cost);
    item.averageCost = costs.reduce((sum, cost) => sum + cost, 0) / costs.length;
    item.costVariation = item.costRange.max - item.costRange.min;
    item.costVariationPercentage = (item.costVariation / item.averageCost) * 100;

    // Find best and worst suppliers
    item.bestSupplier = item.suppliers.reduce((min, supplier) => 
      supplier.cost < min.cost ? supplier : min
    );
    item.worstSupplier = item.suppliers.reduce((max, supplier) => 
      supplier.cost > max.cost ? supplier : max
    );

    // Calculate potential savings
    item.potentialSavings = item.costVariation;
    item.savingsPercentage = item.costVariationPercentage;
  });

  return {
    period,
    comparison: Object.values(costComparison),
    summary: {
      totalItems: Object.keys(costComparison).length,
      itemsWithMultipleSuppliers: Object.values(costComparison).filter(item => item.suppliers.length > 1).length,
      averageCostVariation: Object.values(costComparison).reduce((sum, item) => sum + item.costVariationPercentage, 0) / Object.keys(costComparison).length,
      totalPotentialSavings: Object.values(costComparison).reduce((sum, item) => sum + item.potentialSavings, 0)
    }
  };
}

async function getSupplierRiskAssessment(tenantId, options = {}) {
  const { period = 180 } = options;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);

  // Get supplier data with purchase history
  const suppliers = await prisma.supplier.findMany({
    include: {
      purchaseOrders: {
        where: {
          tenantId,
          createdAt: { gte: startDate }
        },
        include: {
          items: {
            include: {
              item: {
                select: { id: true, name: true, sku: true, type: true }
              }
            }
          }
        }
      },
      items: {
        include: {
          item: {
            select: { id: true, name: true, sku: true, type: true }
          }
        }
      }
    }
  });

  const riskAssessment = suppliers.map(supplier => {
    const totalOrders = supplier.purchaseOrders.length;
    const totalValue = supplier.purchaseOrders.reduce((sum, po) => 
      sum + po.items.reduce((itemSum, item) => 
        itemSum + (parseFloat(item.quantity) * parseFloat(item.unitCost)), 0
      ), 0
    );

    // Calculate risk factors
    const riskFactors = {
      dependency: calculateDependencyRisk(supplier, totalValue),
      performance: calculatePerformanceRisk(supplier.purchaseOrders),
      concentration: calculateConcentrationRisk(supplier, totalOrders),
      financial: calculateFinancialRisk(supplier),
      operational: calculateOperationalRisk(supplier)
    };

    // Calculate overall risk score
    const riskScore = Object.values(riskFactors).reduce((sum, risk) => sum + risk.score, 0) / Object.keys(riskFactors).length;

    return {
      supplier: {
        id: supplier.id,
        name: supplier.name,
        contact: supplier.contact,
        email: supplier.email,
        phone: supplier.phone
      },
      metrics: {
        totalOrders,
        totalValue,
        averageOrderValue: totalOrders > 0 ? totalValue / totalOrders : 0,
        itemCount: supplier.items.length,
        orderFrequency: totalOrders / (period / 30) // Orders per month
      },
      riskFactors,
      riskScore,
      riskLevel: riskScore > 70 ? 'HIGH' : riskScore > 40 ? 'MEDIUM' : 'LOW',
      recommendations: generateRiskRecommendations(riskFactors, riskScore)
    };
  });

  return {
    period,
    assessment: riskAssessment.sort((a, b) => b.riskScore - a.riskScore),
    summary: {
      totalSuppliers: riskAssessment.length,
      highRiskSuppliers: riskAssessment.filter(s => s.riskLevel === 'HIGH').length,
      mediumRiskSuppliers: riskAssessment.filter(s => s.riskLevel === 'MEDIUM').length,
      lowRiskSuppliers: riskAssessment.filter(s => s.riskLevel === 'LOW').length,
      averageRiskScore: riskAssessment.reduce((sum, s) => sum + s.riskScore, 0) / riskAssessment.length
    }
  };
}

function calculateDependencyRisk(supplier, totalValue) {
  // This is a simplified calculation - in reality, you'd compare against total spend
  const dependencyScore = Math.min(100, (totalValue / 100000) * 100); // Assuming 100k as high dependency threshold
  
  return {
    type: 'DEPENDENCY',
    score: dependencyScore,
    description: dependencyScore > 70 ? 'High dependency on this supplier' : 
                 dependencyScore > 40 ? 'Moderate dependency' : 'Low dependency',
    factors: [
      `Total spend: ${totalValue.toFixed(2)}`,
      `Item count: ${supplier.items.length}`
    ]
  };
}

function calculatePerformanceRisk(purchaseOrders) {
  if (purchaseOrders.length === 0) {
    return {
      type: 'PERFORMANCE',
      score: 50,
      description: 'No recent performance data',
      factors: ['No recent orders']
    };
  }

  const lateOrders = purchaseOrders.filter(po => 
    po.expectedAt && po.updatedAt > po.expectedAt
  ).length;

  const performanceScore = ((lateOrders / purchaseOrders.length) * 100);
  
  return {
    type: 'PERFORMANCE',
    score: performanceScore,
    description: performanceScore > 30 ? 'Poor delivery performance' : 
                 performanceScore > 10 ? 'Moderate performance issues' : 'Good performance',
    factors: [
      `Late deliveries: ${lateOrders}/${purchaseOrders.length}`,
      `On-time rate: ${((purchaseOrders.length - lateOrders) / purchaseOrders.length * 100).toFixed(1)}%`
    ]
  };
}

function calculateConcentrationRisk(supplier, totalOrders) {
  // Simplified calculation - in reality, you'd compare against total supplier count
  const concentrationScore = Math.min(100, (totalOrders / 50) * 100); // Assuming 50 orders as high concentration
  
  return {
    type: 'CONCENTRATION',
    score: concentrationScore,
    description: concentrationScore > 60 ? 'High order concentration' : 
                 concentrationScore > 30 ? 'Moderate concentration' : 'Low concentration',
    factors: [
      `Order count: ${totalOrders}`,
      `Item portfolio: ${supplier.items.length} items`
    ]
  };
}

function calculateFinancialRisk(supplier) {
  // This would typically integrate with external financial data
  // For now, using a simplified scoring based on available data
  const financialScore = 30; // Default moderate risk
  
  return {
    type: 'FINANCIAL',
    score: financialScore,
    description: 'Moderate financial risk (requires external data)',
    factors: [
      'External financial data not available',
      'Consider credit checks and financial monitoring'
    ]
  };
}

function calculateOperationalRisk(supplier) {
  const operationalScore = 25; // Default low risk
  
  return {
    type: 'OPERATIONAL',
    score: operationalScore,
    description: 'Low operational risk',
    factors: [
      'Supplier contact information available',
      'Active in purchase orders'
    ]
  };
}

function generateRiskRecommendations(riskFactors, riskScore) {
  const recommendations = [];

  if (riskScore > 70) {
    recommendations.push({
      priority: 'HIGH',
      action: 'URGENT_REVIEW',
      description: 'Immediate risk mitigation required',
      steps: [
        'Identify alternative suppliers',
        'Implement backup procurement strategies',
        'Increase monitoring frequency'
      ]
    });
  } else if (riskScore > 40) {
    recommendations.push({
      priority: 'MEDIUM',
      action: 'MONITOR_CLOSELY',
      description: 'Regular monitoring and risk assessment',
      steps: [
        'Quarterly performance reviews',
        'Develop contingency plans',
        'Consider supplier diversification'
      ]
    });
  } else {
    recommendations.push({
      priority: 'LOW',
      action: 'MAINTAIN_RELATIONSHIP',
      description: 'Continue current relationship with regular reviews',
      steps: [
        'Annual performance reviews',
        'Maintain good communication',
        'Monitor for changes'
      ]
    });
  }

  // Add specific recommendations based on risk factors
  Object.values(riskFactors).forEach(factor => {
    if (factor.score > 60) {
      recommendations.push({
        priority: 'MEDIUM',
        action: 'ADDRESS_RISK_FACTOR',
        description: `Address ${factor.type.toLowerCase()} risk`,
        steps: [
          `Review ${factor.type.toLowerCase()} factors`,
          'Develop mitigation strategies',
          'Monitor improvements'
        ]
      });
    }
  });

  return recommendations;
}

async function getSupplierCollaborationOpportunities(tenantId, options = {}) {
  const { period = 90 } = options;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);

  // Get supplier performance data
  const suppliers = await prisma.supplier.findMany({
    include: {
      purchaseOrders: {
        where: {
          tenantId,
          createdAt: { gte: startDate }
        },
        include: {
          items: {
            include: {
              item: {
                select: { id: true, name: true, sku: true, type: true }
              }
            }
          }
        }
      },
      items: {
        include: {
          item: {
            select: { id: true, name: true, sku: true, type: true }
          }
        }
      }
    }
  });

  const opportunities = suppliers.map(supplier => {
    const totalOrders = supplier.purchaseOrders.length;
    const totalValue = supplier.purchaseOrders.reduce((sum, po) => 
      sum + po.items.reduce((itemSum, item) => 
        itemSum + (parseFloat(item.quantity) * parseFloat(item.unitCost)), 0
      ), 0
    );

    const opportunities = [];

    // Volume growth opportunity
    if (totalValue > 5000 && totalOrders > 3) {
      opportunities.push({
        type: 'VOLUME_GROWTH',
        priority: 'HIGH',
        description: 'Increase order volume for better pricing',
        potentialBenefit: '5-15% cost reduction through volume discounts',
        action: 'Negotiate volume-based pricing tiers'
      });
    }

    // Long-term contract opportunity
    if (totalOrders > 10 && totalValue > 10000) {
      opportunities.push({
        type: 'LONG_TERM_CONTRACT',
        priority: 'MEDIUM',
        description: 'Establish long-term supply agreement',
        potentialBenefit: 'Price stability and priority allocation',
        action: 'Propose 12-24 month supply agreement'
      });
    }

    // Strategic partnership opportunity
    if (supplier.items.length > 5 && totalValue > 20000) {
      opportunities.push({
        type: 'STRATEGIC_PARTNERSHIP',
        priority: 'MEDIUM',
        description: 'Develop strategic supplier partnership',
        potentialBenefit: 'Joint planning, innovation, and cost optimization',
        action: 'Initiate strategic partnership discussions'
      });
    }

    // Process improvement opportunity
    if (totalOrders > 5) {
      opportunities.push({
        type: 'PROCESS_IMPROVEMENT',
        priority: 'LOW',
        description: 'Streamline ordering and delivery processes',
        potentialBenefit: 'Reduced lead times and administrative costs',
        action: 'Implement EDI or automated ordering systems'
      });
    }

    return {
      supplier: {
        id: supplier.id,
        name: supplier.name,
        contact: supplier.contact,
        email: supplier.email
      },
      metrics: {
        totalOrders,
        totalValue,
        itemCount: supplier.items.length,
        averageOrderValue: totalOrders > 0 ? totalValue / totalOrders : 0
      },
      opportunities,
      summary: {
        totalOpportunities: opportunities.length,
        highPriority: opportunities.filter(o => o.priority === 'HIGH').length,
        mediumPriority: opportunities.filter(o => o.priority === 'MEDIUM').length,
        lowPriority: opportunities.filter(o => o.priority === 'LOW').length
      }
    };
  });

  return {
    period,
    opportunities: opportunities.filter(s => s.opportunities.length > 0),
    summary: {
      suppliersWithOpportunities: opportunities.filter(s => s.opportunities.length > 0).length,
      totalOpportunities: opportunities.reduce((sum, s) => sum + s.opportunities.length, 0),
      highPriorityOpportunities: opportunities.reduce((sum, s) => sum + s.summary.highPriority, 0)
    }
  };
}

module.exports = {
  getSupplierPerformanceAnalysis,
  getSupplierCostComparison,
  getSupplierRiskAssessment,
  getSupplierCollaborationOpportunities
};
