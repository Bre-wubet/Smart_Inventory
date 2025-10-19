const { prisma } = require('../../config/db');
const { ValidationError, NotFoundError } = require('../../core/exceptions');
const { POStatus, TransactionType } = require('../../core/constants');

async function getPurchaseDashboard(tenantId, options = {}) {
  const { period = 30, supplierId, warehouseId } = options;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);

  // Get purchase orders for the period
  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: {
      tenantId,
      createdAt: { gte: startDate },
      ...(supplierId && { supplierId }),
      ...(warehouseId && {
        transactions: {
          some: { warehouseId }
        }
      })
    },
    include: {
      supplier: {
        select: { id: true, name: true, contact: true }
      },
      items: {
        include: {
          item: {
            select: { id: true, name: true, sku: true, type: true, unit: true }
          }
        }
      },
      transactions: {
        where: warehouseId ? { warehouseId } : {},
        include: {
          item: {
            select: { id: true, name: true, sku: true, type: true }
          },
          warehouse: {
            select: { id: true, name: true, code: true }
          }
        }
      }
    }
  });

  // Calculate key metrics
  const totalPOs = purchaseOrders.length;
  const totalValue = purchaseOrders.reduce((sum, po) => 
    sum + po.items.reduce((itemSum, item) => 
      itemSum + (parseFloat(item.quantity) * parseFloat(item.unitCost)), 0
    ), 0
  );

  const totalReceivedValue = purchaseOrders.reduce((sum, po) => 
    sum + po.items.reduce((itemSum, item) => 
      itemSum + (parseFloat(item.receivedQty) * parseFloat(item.unitCost)), 0
    ), 0
  );

  // Group by status
  const byStatus = purchaseOrders.reduce((acc, po) => {
    if (!acc[po.status]) {
      acc[po.status] = { count: 0, value: 0 };
    }
    acc[po.status].count++;
    acc[po.status].value += po.items.reduce((sum, item) => 
      sum + (parseFloat(item.quantity) * parseFloat(item.unitCost)), 0
    );
    return acc;
  }, {});

  // Group by supplier
  const bySupplier = purchaseOrders.reduce((acc, po) => {
    const supplierName = po.supplier.name;
    if (!acc[supplierName]) {
      acc[supplierName] = {
        count: 0,
        value: 0,
        supplier: po.supplier
      };
    }
    acc[supplierName].count++;
    acc[supplierName].value += po.items.reduce((sum, item) => 
      sum + (parseFloat(item.quantity) * parseFloat(item.unitCost)), 0
    );
    return acc;
  }, {});

  // Group by item type
  const byItemType = purchaseOrders.reduce((acc, po) => {
    po.items.forEach(item => {
      const type = item.item.type;
      if (!acc[type]) {
        acc[type] = { count: 0, value: 0, quantity: 0 };
      }
      acc[type].count++;
      acc[type].value += parseFloat(item.quantity) * parseFloat(item.unitCost);
      acc[type].quantity += parseFloat(item.quantity);
    });
    return acc;
  }, {});

  // Calculate trends
  const dailyTrends = purchaseOrders.reduce((acc, po) => {
    const date = po.createdAt.toISOString().split('T')[0];
    if (!acc[date]) {
      acc[date] = { count: 0, value: 0 };
    }
    acc[date].count++;
    acc[date].value += po.items.reduce((sum, item) => 
      sum + (parseFloat(item.quantity) * parseFloat(item.unitCost)), 0
    );
    return acc;
  }, {});

  // Calculate performance metrics
  const completedPOs = purchaseOrders.filter(po => po.status === POStatus.RECEIVED);
  const averageCompletionTime = completedPOs.length > 0 
    ? completedPOs.reduce((sum, po) => {
        const completionTime = po.updatedAt.getTime() - po.createdAt.getTime();
        return sum + completionTime;
      }, 0) / completedPOs.length / (1000 * 60 * 60 * 24) // Convert to days
    : 0;

  return {
    period,
    summary: {
      totalPOs,
      totalValue,
      totalReceivedValue,
      averagePOValue: totalPOs > 0 ? totalValue / totalPOs : 0,
      averageCompletionTime,
      completionRate: totalPOs > 0 ? (completedPOs.length / totalPOs) * 100 : 0
    },
    byStatus,
    bySupplier,
    byItemType,
    trends: {
      dailyTrends
    }
  };
}

async function getPurchasePerformance(tenantId, options = {}) {
  const { period = 90, supplierId } = options;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);

  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: {
      tenantId,
      createdAt: { gte: startDate },
      ...(supplierId && { supplierId })
    },
    include: {
      supplier: {
        select: { id: true, name: true, contact: true }
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

  // Calculate supplier performance metrics
  const supplierPerformance = purchaseOrders.reduce((acc, po) => {
    const supplierName = po.supplier.name;
    if (!acc[supplierName]) {
      acc[supplierName] = {
        supplier: po.supplier,
        totalPOs: 0,
        totalValue: 0,
        onTimeDeliveries: 0,
        lateDeliveries: 0,
        averageLeadTime: 0,
        qualityScore: 0
      };
    }

    acc[supplierName].totalPOs++;
    acc[supplierName].totalValue += po.items.reduce((sum, item) => 
      sum + (parseFloat(item.quantity) * parseFloat(item.unitCost)), 0
    );

    // Calculate delivery performance
    if (po.status === POStatus.RECEIVED && po.expectedAt) {
      const deliveryTime = po.updatedAt.getTime() - po.createdAt.getTime();
      const expectedTime = po.expectedAt.getTime() - po.createdAt.getTime();
      
      if (deliveryTime <= expectedTime) {
        acc[supplierName].onTimeDeliveries++;
      } else {
        acc[supplierName].lateDeliveries++;
      }
      
      acc[supplierName].averageLeadTime += deliveryTime / (1000 * 60 * 60 * 24); // Convert to days
    }

    return acc;
  }, {});

  // Calculate performance scores
  Object.keys(supplierPerformance).forEach(supplierName => {
    const supplier = supplierPerformance[supplierName];
    const totalDeliveries = supplier.onTimeDeliveries + supplier.lateDeliveries;
    
    if (totalDeliveries > 0) {
      supplier.onTimeDeliveryRate = (supplier.onTimeDeliveries / totalDeliveries) * 100;
      supplier.averageLeadTime = supplier.averageLeadTime / totalDeliveries;
    } else {
      supplier.onTimeDeliveryRate = 0;
      supplier.averageLeadTime = 0;
    }

    // Calculate quality score (simplified)
    supplier.qualityScore = Math.min(100, 
      (supplier.onTimeDeliveryRate * 0.6) + 
      (Math.max(0, 100 - supplier.averageLeadTime) * 0.4)
    );
  });

  // Calculate cost analysis
  const costAnalysis = purchaseOrders.reduce((acc, po) => {
    po.items.forEach(item => {
      const itemType = item.item.type;
      if (!acc[itemType]) {
        acc[itemType] = {
          totalQuantity: 0,
          totalCost: 0,
          averageCost: 0,
          suppliers: new Set()
        };
      }
      acc[itemType].totalQuantity += parseFloat(item.quantity);
      acc[itemType].totalCost += parseFloat(item.quantity) * parseFloat(item.unitCost);
      acc[itemType].suppliers.add(po.supplier.name);
    });
    return acc;
  }, {});

  // Calculate average costs
  Object.keys(costAnalysis).forEach(type => {
    const analysis = costAnalysis[type];
    analysis.averageCost = analysis.totalQuantity > 0 ? analysis.totalCost / analysis.totalQuantity : 0;
    analysis.supplierCount = analysis.suppliers.size;
    delete analysis.suppliers; // Remove Set from response
  });

  return {
    period,
    supplierPerformance: Object.values(supplierPerformance),
    costAnalysis,
    summary: {
      totalSuppliers: Object.keys(supplierPerformance).length,
      averageQualityScore: Object.values(supplierPerformance).reduce((sum, s) => sum + s.qualityScore, 0) / Object.keys(supplierPerformance).length,
      totalValue: purchaseOrders.reduce((sum, po) => 
        sum + po.items.reduce((itemSum, item) => 
          itemSum + (parseFloat(item.quantity) * parseFloat(item.unitCost)), 0
        ), 0
      )
    }
  };
}

async function getPurchaseCostAnalysis(tenantId, options = {}) {
  const { period = 365, itemId, supplierId, itemType } = options;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);

  const where = {
    tenantId,
    createdAt: { gte: startDate },
    ...(itemId && {
      items: {
        some: { itemId }
      }
    }),
    ...(supplierId && { supplierId }),
    ...(itemType && {
      items: {
        some: {
          item: { type: itemType }
        }
      }
    })
  };

  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where,
    include: {
      supplier: {
        select: { id: true, name: true }
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

  // Calculate cost trends by month
  const monthlyTrends = purchaseOrders.reduce((acc, po) => {
    const month = po.createdAt.toISOString().substring(0, 7); // YYYY-MM
    if (!acc[month]) {
      acc[month] = {
        totalValue: 0,
        totalQuantity: 0,
        poCount: 0,
        averageCost: 0
      };
    }
    
    po.items.forEach(item => {
      acc[month].totalValue += parseFloat(item.quantity) * parseFloat(item.unitCost);
      acc[month].totalQuantity += parseFloat(item.quantity);
    });
    acc[month].poCount++;
    
    return acc;
  }, {});

  // Calculate average costs for each month
  Object.keys(monthlyTrends).forEach(month => {
    const trend = monthlyTrends[month];
    trend.averageCost = trend.totalQuantity > 0 ? trend.totalValue / trend.totalQuantity : 0;
  });

  // Calculate supplier cost comparison
  const supplierCosts = purchaseOrders.reduce((acc, po) => {
    const supplierName = po.supplier.name;
    if (!acc[supplierName]) {
      acc[supplierName] = {
        supplier: po.supplier,
        totalValue: 0,
        totalQuantity: 0,
        averageCost: 0,
        itemCount: 0
      };
    }

    po.items.forEach(item => {
      acc[supplierName].totalValue += parseFloat(item.quantity) * parseFloat(item.unitCost);
      acc[supplierName].totalQuantity += parseFloat(item.quantity);
      acc[supplierName].itemCount++;
    });

    return acc;
  }, {});

  // Calculate average costs for each supplier
  Object.keys(supplierCosts).forEach(supplierName => {
    const supplier = supplierCosts[supplierName];
    supplier.averageCost = supplier.totalQuantity > 0 ? supplier.totalValue / supplier.totalQuantity : 0;
  });

  // Calculate item cost analysis
  const itemCosts = purchaseOrders.reduce((acc, po) => {
    po.items.forEach(item => {
      const itemKey = `${item.item.id}-${item.item.name}`;
      if (!acc[itemKey]) {
        acc[itemKey] = {
          item: item.item,
          totalQuantity: 0,
          totalCost: 0,
          averageCost: 0,
          suppliers: new Set(),
          costHistory: []
        };
      }
      
      acc[itemKey].totalQuantity += parseFloat(item.quantity);
      acc[itemKey].totalCost += parseFloat(item.quantity) * parseFloat(item.unitCost);
      acc[itemKey].suppliers.add(po.supplier.name);
      acc[itemKey].costHistory.push({
        date: po.createdAt,
        cost: parseFloat(item.unitCost),
        quantity: parseFloat(item.quantity),
        supplier: po.supplier.name
      });
    });
    return acc;
  }, {});

  // Calculate average costs and clean up data
  Object.keys(itemCosts).forEach(itemKey => {
    const item = itemCosts[itemKey];
    item.averageCost = item.totalQuantity > 0 ? item.totalCost / item.totalQuantity : 0;
    item.supplierCount = item.suppliers.size;
    delete item.suppliers; // Remove Set from response
    
    // Sort cost history by date
    item.costHistory.sort((a, b) => new Date(a.date) - new Date(b.date));
  });

  return {
    period,
    monthlyTrends,
    supplierCosts: Object.values(supplierCosts),
    itemCosts: Object.values(itemCosts),
    summary: {
      totalValue: purchaseOrders.reduce((sum, po) => 
        sum + po.items.reduce((itemSum, item) => 
          itemSum + (parseFloat(item.quantity) * parseFloat(item.unitCost)), 0
        ), 0
      ),
      averageMonthlyValue: Object.values(monthlyTrends).reduce((sum, trend) => sum + trend.totalValue, 0) / Object.keys(monthlyTrends).length,
      totalSuppliers: Object.keys(supplierCosts).length,
      totalItems: Object.keys(itemCosts).length
    }
  };
}

async function getPurchaseForecasting(tenantId, options = {}) {
  const { period = 90, forecastPeriod = 30 } = options;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);

  // Get historical purchase data
  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: {
      tenantId,
      createdAt: { gte: startDate },
      status: { in: [POStatus.RECEIVED, POStatus.PARTIALLY_RECEIVED] }
    },
    include: {
      items: {
        include: {
          item: {
            select: { id: true, name: true, sku: true, type: true, unit: true }
          }
        }
      }
    }
  });

  // Calculate consumption patterns
  const consumptionPatterns = purchaseOrders.reduce((acc, po) => {
    po.items.forEach(item => {
      const itemId = item.item.id;
      if (!acc[itemId]) {
        acc[itemId] = {
          item: item.item,
          monthlyConsumption: {},
          totalConsumption: 0,
          averageMonthlyConsumption: 0,
          trend: 'stable'
        };
      }

      const month = po.createdAt.toISOString().substring(0, 7);
      if (!acc[itemId].monthlyConsumption[month]) {
        acc[itemId].monthlyConsumption[month] = 0;
      }
      
      acc[itemId].monthlyConsumption[month] += parseFloat(item.quantity);
      acc[itemId].totalConsumption += parseFloat(item.quantity);
    });
    return acc;
  }, {});

  // Calculate trends and forecasts
  Object.keys(consumptionPatterns).forEach(itemId => {
    const pattern = consumptionPatterns[itemId];
    const months = Object.keys(pattern.monthlyConsumption);
    
    if (months.length > 1) {
      pattern.averageMonthlyConsumption = pattern.totalConsumption / months.length;
      
      // Simple trend calculation
      const firstMonth = pattern.monthlyConsumption[months[0]];
      const lastMonth = pattern.monthlyConsumption[months[months.length - 1]];
      const trendValue = (lastMonth - firstMonth) / firstMonth;
      
      if (trendValue > 0.1) {
        pattern.trend = 'increasing';
      } else if (trendValue < -0.1) {
        pattern.trend = 'decreasing';
      } else {
        pattern.trend = 'stable';
      }
      
      // Forecast next period consumption
      pattern.forecastedConsumption = pattern.averageMonthlyConsumption * (forecastPeriod / 30);
    } else {
      pattern.averageMonthlyConsumption = pattern.totalConsumption;
      pattern.forecastedConsumption = pattern.totalConsumption * (forecastPeriod / 30);
    }
  });

  // Get current stock levels for reorder recommendations
  const stockLevels = await prisma.stock.findMany({
    where: {
      item: { tenantId }
    },
    include: {
      item: {
        select: { id: true, name: true, sku: true, type: true, unit: true }
      },
      warehouse: {
        select: { id: true, name: true, code: true }
      }
    }
  });

  // Generate reorder recommendations
  const reorderRecommendations = Object.values(consumptionPatterns).map(pattern => {
    const currentStock = stockLevels
      .filter(stock => stock.item.id === pattern.item.id)
      .reduce((sum, stock) => sum + parseFloat(stock.quantity), 0);

    const daysOfStock = pattern.averageMonthlyConsumption > 0 
      ? (currentStock / pattern.averageMonthlyConsumption) * 30 
      : 999;

    const recommendedOrder = Math.max(0, pattern.forecastedConsumption - currentStock);
    const urgency = daysOfStock < 7 ? 'high' : daysOfStock < 30 ? 'medium' : 'low';

    return {
      item: pattern.item,
      currentStock,
      averageMonthlyConsumption: pattern.averageMonthlyConsumption,
      forecastedConsumption: pattern.forecastedConsumption,
      daysOfStock,
      recommendedOrder,
      urgency,
      trend: pattern.trend
    };
  }).filter(rec => rec.recommendedOrder > 0);

  return {
    period,
    forecastPeriod,
    consumptionPatterns: Object.values(consumptionPatterns),
    reorderRecommendations,
    summary: {
      totalItems: Object.keys(consumptionPatterns).length,
      highUrgencyItems: reorderRecommendations.filter(r => r.urgency === 'high').length,
      mediumUrgencyItems: reorderRecommendations.filter(r => r.urgency === 'medium').length,
      lowUrgencyItems: reorderRecommendations.filter(r => r.urgency === 'low').length,
      totalRecommendedValue: reorderRecommendations.reduce((sum, rec) => 
        sum + (rec.recommendedOrder * parseFloat(rec.item.cost || 0)), 0
      )
    }
  };
}

module.exports = {
  getPurchaseDashboard,
  getPurchasePerformance,
  getPurchaseCostAnalysis,
  getPurchaseForecasting
};
