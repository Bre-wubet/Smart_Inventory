// src/modules/warehouse/warehouse-analytics.service.js
const { prisma } = require('../../config/db');
const { ValidationError, NotFoundError } = require('../../core/exceptions');
const { MovementType, TransactionType } = require('../../core/constants');
const { calculateAvailableStock, calculateStockTurnover, calculateDaysOfInventory } = require('../../core/utils/stockFormulas');

// Advanced warehouse analytics helpers

// Helper to analyze warehouse efficiency metrics
async function analyzeWarehouseEfficiency(warehouseId, tenantId, period = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);

  const warehouse = await prisma.warehouse.findFirst({
    where: { id: warehouseId, tenantId },
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

  if (!warehouse) {
    throw new NotFoundError('Warehouse not found');
  }

  // Get transaction data
  const transactions = await prisma.inventoryTransaction.findMany({
    where: {
      warehouseId,
      createdAt: { gte: startDate }
    },
    include: {
      item: {
        select: { id: true, name: true, cost: true }
      }
    }
  });

  // Calculate efficiency metrics
  const inboundTransactions = transactions.filter(t => 
    ['PURCHASE', 'TRANSFER'].includes(t.type) && parseFloat(t.quantity) > 0
  );
  const outboundTransactions = transactions.filter(t => 
    ['SALE', 'USAGE', 'TRANSFER'].includes(t.type) && parseFloat(t.quantity) < 0
  );

  const totalInbound = inboundTransactions.reduce((sum, t) => sum + Math.abs(parseFloat(t.quantity)), 0);
  const totalOutbound = outboundTransactions.reduce((sum, t) => sum + Math.abs(parseFloat(t.quantity)), 0);

  // Calculate space utilization
  const totalQuantity = warehouse.stock.reduce((sum, stock) => sum + parseFloat(stock.quantity), 0);
  const totalReserved = warehouse.stock.reduce((sum, stock) => sum + parseFloat(stock.reserved), 0);
  const totalAvailable = totalQuantity - totalReserved;

  // Calculate turnover by item type
  const turnoverByType = {};
  warehouse.stock.forEach(stock => {
    const type = stock.item.type;
    if (!turnoverByType[type]) {
      turnoverByType[type] = { quantity: 0, value: 0, items: 0 };
    }
    turnoverByType[type].quantity += parseFloat(stock.quantity);
    turnoverByType[type].value += parseFloat(stock.quantity) * parseFloat(stock.item.cost || 0);
    turnoverByType[type].items += 1;
  });

  return {
    warehouse: {
      id: warehouse.id,
      name: warehouse.name,
      code: warehouse.code,
      location: warehouse.location
    },
    efficiency: {
      period,
      totalInbound,
      totalOutbound,
      netMovement: totalInbound - totalOutbound,
      spaceUtilization: totalQuantity > 0 ? (totalAvailable / totalQuantity) * 100 : 0,
      averageDailyMovement: (totalInbound + totalOutbound) / period,
      turnoverByType,
      transactionEfficiency: {
        inboundTransactions: inboundTransactions.length,
        outboundTransactions: outboundTransactions.length,
        averageTransactionSize: transactions.length > 0 
          ? transactions.reduce((sum, t) => sum + Math.abs(parseFloat(t.quantity)), 0) / transactions.length 
          : 0
      }
    }
  };
}

// Helper to identify warehouse bottlenecks
async function identifyWarehouseBottlenecks(tenantId, options = {}) {
  const { warehouseId, period = 30 } = options;

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
      },
      transactions: {
        where: {
          createdAt: { gte: new Date(Date.now() - period * 24 * 60 * 60 * 1000) }
        }
      }
    }
  });

  const bottlenecks = [];

  for (const warehouse of warehouses) {
    const totalItems = warehouse.stock.length;
    const totalQuantity = warehouse.stock.reduce((sum, stock) => sum + parseFloat(stock.quantity), 0);
    const totalReserved = warehouse.stock.reduce((sum, stock) => sum + parseFloat(stock.reserved), 0);
    const totalAvailable = totalQuantity - totalReserved;

    // Identify bottlenecks
    const warehouseBottlenecks = [];

    // High utilization bottleneck
    if (totalReserved > totalAvailable * 0.8) {
      warehouseBottlenecks.push({
        type: 'HIGH_RESERVATION_RATE',
        severity: 'HIGH',
        description: 'High reservation rate limiting available space',
        impact: 'Reduced operational flexibility',
        recommendation: 'Review reservation policies or increase capacity'
      });
    }

    // Low turnover bottleneck
    const transactionCount = warehouse.transactions.length;
    const averageTransactionsPerItem = totalItems > 0 ? transactionCount / totalItems : 0;
    if (averageTransactionsPerItem < 0.5) {
      warehouseBottlenecks.push({
        type: 'LOW_TURNOVER',
        severity: 'MEDIUM',
        description: 'Low transaction frequency per item',
        impact: 'Reduced warehouse efficiency',
        recommendation: 'Review item placement and picking strategies'
      });
    }

    // Space constraint bottleneck
    const estimatedCapacity = totalQuantity * 1.5; // Simplified
    const utilizationRate = (totalQuantity / estimatedCapacity) * 100;
    if (utilizationRate > 85) {
      warehouseBottlenecks.push({
        type: 'HIGH_UTILIZATION',
        severity: 'HIGH',
        description: 'Warehouse utilization exceeds optimal levels',
        impact: 'Limited space for new inventory',
        recommendation: 'Consider expansion or inventory redistribution'
      });
    }

    if (warehouseBottlenecks.length > 0) {
      bottlenecks.push({
        warehouse: {
          id: warehouse.id,
          name: warehouse.name,
          code: warehouse.code,
          location: warehouse.location
        },
        bottlenecks: warehouseBottlenecks,
        metrics: {
          totalItems,
          totalQuantity,
          totalReserved,
          totalAvailable,
          utilizationRate: Math.round(utilizationRate * 100) / 100,
          transactionCount,
          averageTransactionsPerItem: Math.round(averageTransactionsPerItem * 100) / 100
        }
      });
    }
  }

  return {
    bottlenecks,
    summary: {
      totalWarehouses: warehouses.length,
      warehousesWithBottlenecks: bottlenecks.length,
      totalBottlenecks: bottlenecks.reduce((sum, w) => sum + w.bottlenecks.length, 0),
      bySeverity: bottlenecks.reduce((acc, w) => {
        w.bottlenecks.forEach(b => {
          acc[b.severity] = (acc[b.severity] || 0) + 1;
        });
        return acc;
      }, {})
    }
  };
}

// Helper to analyze warehouse cost efficiency
async function analyzeWarehouseCostEfficiency(tenantId, options = {}) {
  const { 
    warehouseId,
    startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    endDate = new Date()
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
            select: { id: true, name: true, sku: true, cost: true, type: true }
          }
        }
      },
      transactions: {
        where: {
          createdAt: { gte: startDate, lte: endDate }
        }
      }
    }
  });

  const costAnalysis = warehouses.map(warehouse => {
    // Calculate inventory holding costs
    const totalInventoryValue = warehouse.stock.reduce((sum, stock) => 
      sum + (parseFloat(stock.quantity) * parseFloat(stock.item.cost || 0)), 0
    );

    // Calculate operational costs (simplified)
    const transactionCount = warehouse.transactions.length;
    const operationalCostPerTransaction = 15; // $15 per transaction
    const totalOperationalCost = transactionCount * operationalCostPerTransaction;

    // Calculate holding cost (10% annual rate)
    const holdingPeriodDays = Math.ceil((endDate - startDate) / (24 * 60 * 60 * 1000));
    const annualHoldingRate = 0.10;
    const holdingCost = totalInventoryValue * annualHoldingRate * (holdingPeriodDays / 365);

    // Calculate cost per unit stored
    const totalUnits = warehouse.stock.reduce((sum, stock) => sum + parseFloat(stock.quantity), 0);
    const costPerUnit = totalUnits > 0 ? (totalOperationalCost + holdingCost) / totalUnits : 0;

    // Calculate cost efficiency metrics
    const totalCost = totalOperationalCost + holdingCost;
    const costEfficiencyRatio = totalInventoryValue > 0 ? totalCost / totalInventoryValue : 0;

    return {
      warehouse: {
        id: warehouse.id,
        name: warehouse.name,
        code: warehouse.code,
        location: warehouse.location
      },
      costs: {
        totalInventoryValue,
        totalOperationalCost,
        holdingCost,
        totalCost,
        costPerUnit,
        costEfficiencyRatio,
        transactionCount,
        averageTransactionCost: transactionCount > 0 ? totalOperationalCost / transactionCount : 0
      },
      efficiency: {
        inventoryTurnover: totalInventoryValue > 0 ? totalOperationalCost / totalInventoryValue : 0,
        costPerTransaction: transactionCount > 0 ? totalCost / transactionCount : 0,
        valuePerTransaction: transactionCount > 0 ? totalInventoryValue / transactionCount : 0
      }
    };
  });

  return {
    analysis: costAnalysis,
    summary: {
      totalWarehouses: warehouses.length,
      totalInventoryValue: costAnalysis.reduce((sum, w) => sum + w.costs.totalInventoryValue, 0),
      totalCosts: costAnalysis.reduce((sum, w) => sum + w.costs.totalCost, 0),
      averageCostEfficiency: costAnalysis.length > 0 
        ? costAnalysis.reduce((sum, w) => sum + w.costs.costEfficiencyRatio, 0) / costAnalysis.length 
        : 0,
      mostEfficientWarehouse: costAnalysis.reduce((best, current) => 
        current.costs.costEfficiencyRatio < best.costs.costEfficiencyRatio ? current : best
      ),
      leastEfficientWarehouse: costAnalysis.reduce((worst, current) => 
        current.costs.costEfficiencyRatio > worst.costs.costEfficiencyRatio ? current : worst
      )
    },
    period: { startDate, endDate }
  };
}

// Helper to generate warehouse optimization recommendations
async function generateWarehouseOptimizationRecommendations(tenantId, options = {}) {
  const { 
    warehouseId,
    optimizationGoals = ['EFFICIENCY', 'COST_REDUCTION', 'SPACE_UTILIZATION'],
    priority = 'HIGH'
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
      },
      transactions: {
        where: {
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        }
      }
    }
  });

  const recommendations = [];

  for (const warehouse of warehouses) {
    const warehouseRecommendations = [];

    // Calculate current metrics
    const totalItems = warehouse.stock.length;
    const totalQuantity = warehouse.stock.reduce((sum, stock) => sum + parseFloat(stock.quantity), 0);
    const totalReserved = warehouse.stock.reduce((sum, stock) => sum + parseFloat(stock.reserved), 0);
    const totalAvailable = totalQuantity - totalReserved;
    const totalValue = warehouse.stock.reduce((sum, stock) => 
      sum + (parseFloat(stock.quantity) * parseFloat(stock.item.cost || 0)), 0
    );

    // Generate recommendations based on optimization goals
    if (optimizationGoals.includes('EFFICIENCY')) {
      const transactionCount = warehouse.transactions.length;
      const averageTransactionsPerItem = totalItems > 0 ? transactionCount / totalItems : 0;

      if (averageTransactionsPerItem < 1) {
        warehouseRecommendations.push({
          type: 'EFFICIENCY',
          priority: 'HIGH',
          title: 'Improve Item Turnover',
          description: 'Low transaction frequency per item indicates inefficient warehouse operations',
          impact: 'High',
          effort: 'Medium',
          recommendation: 'Implement ABC analysis and optimize item placement based on frequency of access',
          expectedBenefit: '20-30% improvement in picking efficiency',
          implementationSteps: [
            'Conduct ABC analysis of inventory',
            'Relocate high-frequency items to optimal positions',
            'Implement zone picking strategy',
            'Review and optimize picking routes'
          ]
        });
      }
    }

    if (optimizationGoals.includes('COST_REDUCTION')) {
      const holdingCostRate = 0.10; // 10% annual
      const annualHoldingCost = totalValue * holdingCostRate;
      
      if (annualHoldingCost > totalValue * 0.15) {
        warehouseRecommendations.push({
          type: 'COST_REDUCTION',
          priority: 'HIGH',
          title: 'Reduce Holding Costs',
          description: 'High holding costs indicate overstocking or inefficient inventory management',
          impact: 'High',
          effort: 'Medium',
          recommendation: 'Implement just-in-time inventory management and optimize reorder points',
          expectedBenefit: '15-25% reduction in holding costs',
          implementationSteps: [
            'Analyze demand patterns for each item',
            'Optimize reorder points and quantities',
            'Implement automated reorder triggers',
            'Negotiate better terms with suppliers'
          ]
        });
      }
    }

    if (optimizationGoals.includes('SPACE_UTILIZATION')) {
      const estimatedCapacity = totalQuantity * 1.5;
      const utilizationRate = (totalQuantity / estimatedCapacity) * 100;

      if (utilizationRate > 80) {
        warehouseRecommendations.push({
          type: 'SPACE_UTILIZATION',
          priority: 'MEDIUM',
          title: 'Optimize Space Utilization',
          description: 'High space utilization may limit operational flexibility',
          impact: 'Medium',
          effort: 'High',
          recommendation: 'Implement vertical storage solutions and optimize layout',
          expectedBenefit: '20-40% increase in storage capacity',
          implementationSteps: [
            'Conduct space utilization analysis',
            'Implement vertical storage solutions',
            'Optimize warehouse layout',
            'Consider automated storage systems'
          ]
        });
      }
    }

    // Add general recommendations
    if (totalReserved > totalAvailable * 0.7) {
      warehouseRecommendations.push({
        type: 'OPERATIONAL',
        priority: 'MEDIUM',
        title: 'Improve Reservation Management',
        description: 'High reservation rate limits operational flexibility',
        impact: 'Medium',
        effort: 'Low',
        recommendation: 'Review reservation policies and implement dynamic allocation',
        expectedBenefit: 'Improved operational flexibility',
        implementationSteps: [
          'Review current reservation policies',
          'Implement dynamic allocation system',
          'Train staff on new procedures',
          'Monitor and adjust as needed'
        ]
      });
    }

    if (warehouseRecommendations.length > 0) {
      recommendations.push({
        warehouse: {
          id: warehouse.id,
          name: warehouse.name,
          code: warehouse.code,
          location: warehouse.location
        },
        recommendations: warehouseRecommendations,
        metrics: {
          totalItems,
          totalQuantity,
          totalReserved,
          totalAvailable,
          totalValue,
          utilizationRate: Math.round((totalQuantity / (totalQuantity * 1.5)) * 100 * 100) / 100
        }
      });
    }
  }

  return {
    recommendations,
    summary: {
      totalWarehouses: warehouses.length,
      warehousesWithRecommendations: recommendations.length,
      totalRecommendations: recommendations.reduce((sum, w) => sum + w.recommendations.length, 0),
      byType: recommendations.reduce((acc, w) => {
        w.recommendations.forEach(r => {
          acc[r.type] = (acc[r.type] || 0) + 1;
        });
        return acc;
      }, {}),
      byPriority: recommendations.reduce((acc, w) => {
        w.recommendations.forEach(r => {
          acc[r.priority] = (acc[r.priority] || 0) + 1;
        });
        return acc;
      }, {})
    }
  };
}

// Helper to analyze warehouse performance trends
async function analyzeWarehousePerformanceTrends(tenantId, options = {}) {
  const { 
    warehouseId,
    period = 90,
    groupBy = 'week'
  } = options;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);

  const where = {
    warehouse: { tenantId },
    createdAt: { gte: startDate },
    ...(warehouseId && { warehouseId })
  };

  const movements = await prisma.stockMovement.findMany({
    where,
    include: {
      stock: {
        include: {
          item: {
            select: { id: true, name: true, sku: true, cost: true }
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
  const groupedTrends = {};
  movements.forEach(movement => {
    let groupKey;
    const date = new Date(movement.createdAt);
    
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
      default:
        groupKey = date.toISOString().slice(0, 10);
    }

    if (!groupedTrends[groupKey]) {
      groupedTrends[groupKey] = {
        period: groupKey,
        inbound: 0,
        outbound: 0,
        netMovement: 0,
        transactionCount: 0,
        totalValue: 0,
        uniqueItems: new Set(),
        warehouses: new Set()
      };
    }

    const quantity = parseFloat(movement.quantity);
    const value = quantity * parseFloat(movement.stock.item.cost || 0);

    if (movement.type === MovementType.IN) {
      groupedTrends[groupKey].inbound += quantity;
    } else {
      groupedTrends[groupKey].outbound += quantity;
    }

    groupedTrends[groupKey].netMovement = groupedTrends[groupKey].inbound - groupedTrends[groupKey].outbound;
    groupedTrends[groupKey].transactionCount += 1;
    groupedTrends[groupKey].totalValue += value;
    groupedTrends[groupKey].uniqueItems.add(movement.stock.itemId);
    groupedTrends[groupKey].warehouses.add(movement.stock.warehouseId);
  });

  // Convert to array and calculate trends
  const trends = Object.values(groupedTrends).map(group => ({
    ...group,
    uniqueItemsCount: group.uniqueItems.size,
    warehousesCount: group.warehouses.size,
    averageTransactionValue: group.transactionCount > 0 ? group.totalValue / group.transactionCount : 0
  }));

  // Calculate trend analysis
  const trendAnalysis = {
    overallTrend: 'STABLE',
    efficiencyTrend: 'STABLE',
    volumeTrend: 'STABLE'
  };

  if (trends.length >= 2) {
    const firstHalf = trends.slice(0, Math.floor(trends.length / 2));
    const secondHalf = trends.slice(Math.floor(trends.length / 2));

    const firstHalfAvg = firstHalf.reduce((sum, t) => sum + t.transactionCount, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((sum, t) => sum + t.transactionCount, 0) / secondHalf.length;

    if (secondHalfAvg > firstHalfAvg * 1.1) {
      trendAnalysis.overallTrend = 'INCREASING';
    } else if (secondHalfAvg < firstHalfAvg * 0.9) {
      trendAnalysis.overallTrend = 'DECREASING';
    }

    const firstHalfEfficiency = firstHalf.reduce((sum, t) => sum + t.averageTransactionValue, 0) / firstHalf.length;
    const secondHalfEfficiency = secondHalf.reduce((sum, t) => sum + t.averageTransactionValue, 0) / secondHalf.length;

    if (secondHalfEfficiency > firstHalfEfficiency * 1.05) {
      trendAnalysis.efficiencyTrend = 'IMPROVING';
    } else if (secondHalfEfficiency < firstHalfEfficiency * 0.95) {
      trendAnalysis.efficiencyTrend = 'DECLINING';
    }
  }

  return {
    trends,
    trendAnalysis,
    summary: {
      totalPeriods: trends.length,
      averageTransactionsPerPeriod: trends.length > 0 
        ? trends.reduce((sum, t) => sum + t.transactionCount, 0) / trends.length 
        : 0,
      averageVolumePerPeriod: trends.length > 0 
        ? trends.reduce((sum, t) => sum + t.inbound + t.outbound, 0) / trends.length 
        : 0,
      peakPeriod: trends.reduce((peak, current) => 
        current.transactionCount > peak.transactionCount ? current : peak
      ),
      lowestPeriod: trends.reduce((low, current) => 
        current.transactionCount < low.transactionCount ? current : low
      )
    },
    period: { startDate, endDate: new Date(), groupBy }
  };
}

module.exports = {
  analyzeWarehouseEfficiency,
  identifyWarehouseBottlenecks,
  analyzeWarehouseCostEfficiency,
  generateWarehouseOptimizationRecommendations,
  analyzeWarehousePerformanceTrends
};
