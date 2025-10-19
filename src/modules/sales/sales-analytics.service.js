// src/modules/sales/sales-analytics.service.js
const { prisma } = require('../../config/db');
const { ValidationError, NotFoundError } = require('../../core/exceptions');
const { SOStatus, TransactionType } = require('../../core/constants');

// Advanced sales analytics helpers

// Helper to analyze sales trends and patterns
async function analyzeSalesTrends(tenantId, options = {}) {
  const { 
    startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    endDate = new Date(),
    groupBy = 'month'
  } = options;

  const saleOrders = await prisma.saleOrder.findMany({
    where: {
      tenantId,
      createdAt: { gte: startDate, lte: endDate },
      status: 'COMPLETED'
    },
    include: {
      items: {
        include: {
          item: {
            select: { id: true, name: true, sku: true, type: true, cost: true }
          }
        }
      }
    },
    orderBy: { createdAt: 'asc' }
  });

  // Group sales by time period
  const groupedTrends = {};
  saleOrders.forEach(order => {
    let groupKey;
    const date = new Date(order.createdAt);
    
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
      case 'year':
        groupKey = date.getFullYear().toString();
        break;
      default:
        groupKey = date.toISOString().slice(0, 7);
    }

    if (!groupedTrends[groupKey]) {
      groupedTrends[groupKey] = {
        period: groupKey,
        orders: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
        uniqueCustomers: new Set(),
        items: new Set(),
        averageOrderValue: 0
      };
    }

    const orderRevenue = order.items.reduce((sum, item) => 
      sum + (parseFloat(item.quantity) * parseFloat(item.unitPrice)), 0
    );
    const orderCost = order.items.reduce((sum, item) => 
      sum + (parseFloat(item.quantity) * parseFloat(item.item.cost || 0)), 0
    );
    const orderProfit = orderRevenue - orderCost;

    groupedTrends[groupKey].orders += 1;
    groupedTrends[groupKey].revenue += orderRevenue;
    groupedTrends[groupKey].cost += orderCost;
    groupedTrends[groupKey].profit += orderProfit;
    groupedTrends[groupKey].uniqueCustomers.add(order.customer);
    order.items.forEach(item => groupedTrends[groupKey].items.add(item.itemId));
  });

  // Convert to array and calculate trends
  const trends = Object.values(groupedTrends).map(group => ({
    ...group,
    uniqueCustomersCount: group.uniqueCustomers.size,
    uniqueItemsCount: group.items.size,
    averageOrderValue: group.orders > 0 ? group.revenue / group.orders : 0,
    profitMargin: group.revenue > 0 ? (group.profit / group.revenue) * 100 : 0
  }));

  // Calculate trend analysis
  const trendAnalysis = {
    revenueTrend: 'STABLE',
    orderTrend: 'STABLE',
    profitTrend: 'STABLE',
    customerTrend: 'STABLE'
  };

  if (trends.length >= 2) {
    const firstHalf = trends.slice(0, Math.floor(trends.length / 2));
    const secondHalf = trends.slice(Math.floor(trends.length / 2));

    const firstHalfAvgRevenue = firstHalf.reduce((sum, t) => sum + t.revenue, 0) / firstHalf.length;
    const secondHalfAvgRevenue = secondHalf.reduce((sum, t) => sum + t.revenue, 0) / secondHalf.length;

    if (secondHalfAvgRevenue > firstHalfAvgRevenue * 1.1) {
      trendAnalysis.revenueTrend = 'INCREASING';
    } else if (secondHalfAvgRevenue < firstHalfAvgRevenue * 0.9) {
      trendAnalysis.revenueTrend = 'DECREASING';
    }

    const firstHalfAvgOrders = firstHalf.reduce((sum, t) => sum + t.orders, 0) / firstHalf.length;
    const secondHalfAvgOrders = secondHalf.reduce((sum, t) => sum + t.orders, 0) / secondHalf.length;

    if (secondHalfAvgOrders > firstHalfAvgOrders * 1.1) {
      trendAnalysis.orderTrend = 'INCREASING';
    } else if (secondHalfAvgOrders < firstHalfAvgOrders * 0.9) {
      trendAnalysis.orderTrend = 'DECREASING';
    }
  }

  return {
    trends,
    trendAnalysis,
    summary: {
      totalPeriods: trends.length,
      averageRevenuePerPeriod: trends.length > 0 
        ? trends.reduce((sum, t) => sum + t.revenue, 0) / trends.length 
        : 0,
      averageOrdersPerPeriod: trends.length > 0 
        ? trends.reduce((sum, t) => sum + t.orders, 0) / trends.length 
        : 0,
      peakPeriod: trends.reduce((peak, current) => 
        current.revenue > peak.revenue ? current : peak
      ),
      lowestPeriod: trends.reduce((low, current) => 
        current.revenue < low.revenue ? current : low
      )
    },
    period: { startDate, endDate, groupBy }
  };
}

// Helper to analyze customer behavior patterns
async function analyzeCustomerBehavior(tenantId, options = {}) {
  const { 
    startDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
    endDate = new Date()
  } = options;

  const saleOrders = await prisma.saleOrder.findMany({
    where: {
      tenantId,
      createdAt: { gte: startDate, lte: endDate },
      status: 'COMPLETED'
    },
    include: {
      items: {
        include: {
          item: {
            select: { id: true, name: true, sku: true, type: true, cost: true }
          }
        }
      }
    },
    orderBy: { createdAt: 'asc' }
  });

  // Group orders by customer
  const customerBehavior = {};
  saleOrders.forEach(order => {
    const customer = order.customer;
    if (!customerBehavior[customer]) {
      customerBehavior[customer] = {
        customer,
        orders: [],
        totalRevenue: 0,
        totalItems: 0,
        firstOrderDate: order.createdAt,
        lastOrderDate: order.createdAt,
        averageOrderValue: 0,
        orderFrequency: 0,
        preferredItems: new Map(),
        totalProfit: 0
      };
    }

    const orderRevenue = order.items.reduce((sum, item) => 
      sum + (parseFloat(item.quantity) * parseFloat(item.unitPrice)), 0
    );
    const orderCost = order.items.reduce((sum, item) => 
      sum + (parseFloat(item.quantity) * parseFloat(item.item.cost || 0)), 0
    );
    const orderProfit = orderRevenue - orderCost;

    customerBehavior[customer].orders.push(order);
    customerBehavior[customer].totalRevenue += orderRevenue;
    customerBehavior[customer].totalItems += order.items.length;
    customerBehavior[customer].totalProfit += orderProfit;
    
    if (order.createdAt < customerBehavior[customer].firstOrderDate) {
      customerBehavior[customer].firstOrderDate = order.createdAt;
    }
    if (order.createdAt > customerBehavior[customer].lastOrderDate) {
      customerBehavior[customer].lastOrderDate = order.createdAt;
    }

    // Track preferred items
    order.items.forEach(item => {
      const itemId = item.itemId;
      const currentCount = customerBehavior[customer].preferredItems.get(itemId) || 0;
      customerBehavior[customer].preferredItems.set(itemId, currentCount + parseFloat(item.quantity));
    });
  });

  // Calculate additional metrics
  const behaviorAnalysis = Object.values(customerBehavior).map(customer => {
    const orderCount = customer.orders.length;
    const daysBetweenOrders = orderCount > 1 
      ? Math.floor((customer.lastOrderDate - customer.firstOrderDate) / (24 * 60 * 60 * 1000)) / (orderCount - 1)
      : 0;

    return {
      ...customer,
      orderCount,
      averageOrderValue: orderCount > 0 ? customer.totalRevenue / orderCount : 0,
      orderFrequency: daysBetweenOrders,
      customerLifetimeValue: customer.totalRevenue,
      profitMargin: customer.totalRevenue > 0 ? (customer.totalProfit / customer.totalRevenue) * 100 : 0,
      preferredItems: Array.from(customer.preferredItems.entries())
        .map(([itemId, quantity]) => ({ itemId, quantity }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5) // Top 5 preferred items
    };
  });

  // Segment customers by behavior
  const segments = {
    VIP: behaviorAnalysis.filter(c => c.customerLifetimeValue >= 5000),
    LOYAL: behaviorAnalysis.filter(c => c.orderCount >= 5 && c.customerLifetimeValue >= 1000),
    REGULAR: behaviorAnalysis.filter(c => c.orderCount >= 2 && c.customerLifetimeValue >= 500),
    NEW: behaviorAnalysis.filter(c => c.orderCount === 1),
    AT_RISK: behaviorAnalysis.filter(c => {
      const daysSinceLastOrder = Math.floor((Date.now() - c.lastOrderDate.getTime()) / (24 * 60 * 60 * 1000));
      return daysSinceLastOrder > 90 && c.orderCount >= 2;
    })
  };

  return {
    behaviorAnalysis,
    segments,
    summary: {
      totalCustomers: behaviorAnalysis.length,
      averageCustomerLifetimeValue: behaviorAnalysis.length > 0 
        ? behaviorAnalysis.reduce((sum, c) => sum + c.customerLifetimeValue, 0) / behaviorAnalysis.length 
        : 0,
      averageOrderFrequency: behaviorAnalysis.length > 0 
        ? behaviorAnalysis.reduce((sum, c) => sum + c.orderFrequency, 0) / behaviorAnalysis.length 
        : 0,
      segmentCounts: Object.keys(segments).reduce((acc, segment) => {
        acc[segment] = segments[segment].length;
        return acc;
      }, {})
    },
    period: { startDate, endDate }
  };
}

// Helper to analyze product performance
async function analyzeProductPerformance(tenantId, options = {}) {
  const { 
    startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    endDate = new Date(),
    groupBy = 'item'
  } = options;

  const saleOrders = await prisma.saleOrder.findMany({
    where: {
      tenantId,
      createdAt: { gte: startDate, lte: endDate },
      status: 'COMPLETED'
    },
    include: {
      items: {
        include: {
          item: {
            select: { id: true, name: true, sku: true, type: true, cost: true, price: true }
          }
        }
      }
    }
  });

  // Aggregate product performance
  const productPerformance = {};
  saleOrders.forEach(order => {
    order.items.forEach(item => {
      const itemId = item.itemId;
      if (!productPerformance[itemId]) {
        productPerformance[itemId] = {
          item: item.item,
          totalQuantitySold: 0,
          totalRevenue: 0,
          totalCost: 0,
          totalProfit: 0,
          orderCount: 0,
          averagePrice: 0,
          pricePoints: [],
          customers: new Set(),
          salesByPeriod: {}
        };
      }

      const quantity = parseFloat(item.quantity);
      const price = parseFloat(item.unitPrice);
      const cost = parseFloat(item.item.cost || 0);
      const revenue = quantity * price;
      const profit = revenue - (quantity * cost);

      productPerformance[itemId].totalQuantitySold += quantity;
      productPerformance[itemId].totalRevenue += revenue;
      productPerformance[itemId].totalCost += quantity * cost;
      productPerformance[itemId].totalProfit += profit;
      productPerformance[itemId].orderCount += 1;
      productPerformance[itemId].pricePoints.push(price);
      productPerformance[itemId].customers.add(order.customer);

      // Track sales by period
      const periodKey = order.createdAt.toISOString().slice(0, 7); // YYYY-MM
      if (!productPerformance[itemId].salesByPeriod[periodKey]) {
        productPerformance[itemId].salesByPeriod[periodKey] = { quantity: 0, revenue: 0 };
      }
      productPerformance[itemId].salesByPeriod[periodKey].quantity += quantity;
      productPerformance[itemId].salesByPeriod[periodKey].revenue += revenue;
    });
  });

  // Calculate additional metrics
  const performanceAnalysis = Object.values(productPerformance).map(product => {
    const averagePrice = product.pricePoints.length > 0 
      ? product.pricePoints.reduce((sum, price) => sum + price, 0) / product.pricePoints.length 
      : 0;
    const priceVariance = product.pricePoints.length > 1 
      ? calculateVariance(product.pricePoints) 
      : 0;

    return {
      ...product,
      averagePrice: Math.round(averagePrice * 100) / 100,
      priceVariance: Math.round(priceVariance * 100) / 100,
      profitMargin: product.totalRevenue > 0 ? (product.totalProfit / product.totalRevenue) * 100 : 0,
      uniqueCustomers: product.customers.size,
      averageOrderQuantity: product.orderCount > 0 ? product.totalQuantitySold / product.orderCount : 0,
      salesVelocity: product.totalQuantitySold / Math.max(1, Math.floor((endDate - startDate) / (24 * 60 * 60 * 1000))),
      priceRange: {
        min: Math.min(...product.pricePoints),
        max: Math.max(...product.pricePoints),
        average: averagePrice
      }
    };
  });

  // Sort by performance criteria
  const sortedPerformance = performanceAnalysis.sort((a, b) => b.totalRevenue - a.totalRevenue);

  return {
    performanceAnalysis: sortedPerformance,
    summary: {
      totalProducts: performanceAnalysis.length,
      totalRevenue: performanceAnalysis.reduce((sum, p) => sum + p.totalRevenue, 0),
      totalProfit: performanceAnalysis.reduce((sum, p) => sum + p.totalProfit, 0),
      averageProfitMargin: performanceAnalysis.length > 0 
        ? performanceAnalysis.reduce((sum, p) => sum + p.profitMargin, 0) / performanceAnalysis.length 
        : 0,
      topPerformers: sortedPerformance.slice(0, 10),
      underPerformers: sortedPerformance.filter(p => p.profitMargin < 10).slice(0, 10)
    },
    period: { startDate, endDate }
  };
}

function calculateVariance(values) {
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

// Helper to generate sales insights and recommendations
async function generateSalesInsights(tenantId, options = {}) {
  const { 
    startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    endDate = new Date()
  } = options;

  const saleOrders = await prisma.saleOrder.findMany({
    where: {
      tenantId,
      createdAt: { gte: startDate, lte: endDate },
      status: 'COMPLETED'
    },
    include: {
      items: {
        include: {
          item: {
            select: { id: true, name: true, sku: true, type: true, cost: true, price: true }
          }
        }
      }
    }
  });

  const insights = [];

  // Analyze sales patterns
  const dailySales = {};
  saleOrders.forEach(order => {
    const dayKey = order.createdAt.toISOString().slice(0, 10);
    if (!dailySales[dayKey]) {
      dailySales[dayKey] = { revenue: 0, orders: 0 };
    }
    dailySales[dayKey].revenue += order.items.reduce((sum, item) => 
      sum + (parseFloat(item.quantity) * parseFloat(item.unitPrice)), 0
    );
    dailySales[dayKey].orders += 1;
  });

  const dailyValues = Object.values(dailySales);
  const averageDailyRevenue = dailyValues.reduce((sum, day) => sum + day.revenue, 0) / dailyValues.length;
  const peakDay = dailyValues.reduce((peak, current) => 
    current.revenue > peak.revenue ? current : peak
  );

  // Identify peak sales day
  insights.push({
    type: 'PATTERN',
    title: 'Peak Sales Day Analysis',
    description: `Peak sales day generated ${peakDay.revenue.toFixed(2)} in revenue`,
    insight: 'Identify factors contributing to peak performance',
    recommendation: 'Replicate successful strategies on other days',
    impact: 'HIGH',
    data: {
      peakDay: Object.keys(dailySales).find(day => dailySales[day].revenue === peakDay.revenue),
      peakRevenue: peakDay.revenue,
      averageRevenue: averageDailyRevenue
    }
  });

  // Analyze customer patterns
  const customerOrders = {};
  saleOrders.forEach(order => {
    if (!customerOrders[order.customer]) {
      customerOrders[order.customer] = [];
    }
    customerOrders[order.customer].push(order);
  });

  const frequentCustomers = Object.entries(customerOrders)
    .filter(([customer, orders]) => orders.length >= 3)
    .length;

  if (frequentCustomers > 0) {
    insights.push({
      type: 'CUSTOMER',
      title: 'Customer Loyalty Opportunity',
      description: `${frequentCustomers} customers have made 3+ orders`,
      insight: 'High customer retention indicates strong product-market fit',
      recommendation: 'Implement loyalty program and referral incentives',
      impact: 'MEDIUM',
      data: {
        frequentCustomers,
        totalCustomers: Object.keys(customerOrders).length,
        retentionRate: (frequentCustomers / Object.keys(customerOrders).length) * 100
      }
    });
  }

  // Analyze product performance
  const productSales = {};
  saleOrders.forEach(order => {
    order.items.forEach(item => {
      const itemId = item.itemId;
      if (!productSales[itemId]) {
        productSales[itemId] = {
          item: item.item,
          totalSold: 0,
          totalRevenue: 0
        };
      }
      productSales[itemId].totalSold += parseFloat(item.quantity);
      productSales[itemId].totalRevenue += parseFloat(item.quantity) * parseFloat(item.unitPrice);
    });
  });

  const topProduct = Object.values(productSales).reduce((top, current) => 
    current.totalRevenue > top.totalRevenue ? current : top
  );

  insights.push({
    type: 'PRODUCT',
    title: 'Top Performing Product',
    description: `${topProduct.item.name} generated ${topProduct.totalRevenue.toFixed(2)} in revenue`,
    insight: 'Best-selling product indicates market demand',
    recommendation: 'Increase inventory and marketing for top products',
    impact: 'HIGH',
    data: {
      topProduct: topProduct.item,
      revenue: topProduct.totalRevenue,
      quantitySold: topProduct.totalSold
    }
  });

  return {
    insights,
    summary: {
      totalInsights: insights.length,
      byType: insights.reduce((acc, insight) => {
        acc[insight.type] = (acc[insight.type] || 0) + 1;
        return acc;
      }, {}),
      byImpact: insights.reduce((acc, insight) => {
        acc[insight.impact] = (acc[insight.impact] || 0) + 1;
        return acc;
      }, {})
    },
    period: { startDate, endDate }
  };
}

module.exports = {
  analyzeSalesTrends,
  analyzeCustomerBehavior,
  analyzeProductPerformance,
  generateSalesInsights
};
