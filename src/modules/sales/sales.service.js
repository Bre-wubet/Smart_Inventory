const { prisma } = require('../../config/db');
const { ValidationError, NotFoundError } = require('../../core/exceptions');
const { SOStatus, TransactionType } = require('../../core/constants');
const inventoryTransactionService = require('../../core/services/inventoryTransaction.service');
const { calculateStockTurnover, calculateDaysOfInventory } = require('../../core/utils/stockFormulas');
const { integrationManager } = require('../../integrations');

async function createSaleOrder(saleOrderData) {
  const { customer, items, reference, tenantId } = saleOrderData;

  // Validate items exist and belong to tenant
  const itemIds = items.map(item => item.itemId);
  const existingItems = await prisma.item.findMany({
    where: {
      id: { in: itemIds },
      tenantId
    },
    select: { id: true, name: true, sku: true, unit: true, price: true }
  });

  if (existingItems.length !== itemIds.length) {
    throw new ValidationError('One or more items not found or do not belong to tenant');
  }

  // Generate reference if not provided
  const soReference = reference || `SO-${Date.now()}`;

  const saleOrder = await prisma.saleOrder.create({
    data: {
      customer,
      tenantId,
      reference: soReference,
      status: SOStatus.PENDING,
      items: {
        create: items.map(item => {
          const existingItem = existingItems.find(i => i.id === item.itemId);
          return {
            itemId: item.itemId,
            quantity: parseFloat(item.quantity),
            unitPrice: parseFloat(item.unitPrice || existingItem.price || 0)
          };
        })
      }
    },
    include: {
      items: {
        include: {
          item: {
            select: { id: true, name: true, sku: true, unit: true }
          }
        }
      }
    }
  });

  // Publish sales order created event
  try {
    await integrationManager.publishEvent('sales-events', 'sales.order.created', {
      tenantId,
      orderId: saleOrder.id,
      customerId: customer,
      totalAmount: saleOrder.totalAmount,
      currency: 'USD',
      status: saleOrder.status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    // Log error but don't fail the order creation
    console.warn('Failed to publish sales order event:', error.message);
  }

  return saleOrder;
}

async function getSaleOrders({ tenantId, page, limit, search, customer, status }) {
  const skip = (page - 1) * limit;
  
  const where = {
    tenantId,
    ...(search && {
      OR: [
        { reference: { contains: search, mode: 'insensitive' } },
        { customer: { contains: search, mode: 'insensitive' } }
      ]
    }),
    ...(customer && { customer: { contains: customer, mode: 'insensitive' } }),
    ...(status && { status })
  };

  const [saleOrders, total] = await Promise.all([
    prisma.saleOrder.findMany({
      where,
      skip,
      take: limit,
      include: {
        items: {
          include: {
            item: {
              select: { id: true, name: true, sku: true, unit: true }
            }
          }
        },
        _count: {
          select: {
            transactions: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.saleOrder.count({ where })
  ]);

  // Calculate totals for each sale order
  const saleOrdersWithTotals = saleOrders.map(so => {
    const totalAmount = so.items.reduce((sum, item) => 
      sum + (parseFloat(item.quantity) * parseFloat(item.unitPrice)), 0
    );

    return {
      ...so,
      totals: {
        totalAmount,
        totalItems: so.items.length,
        totalQuantity: so.items.reduce((sum, item) => sum + parseFloat(item.quantity), 0)
      }
    };
  });

  return {
    data: saleOrdersWithTotals,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}

async function getSaleOrderById(id, tenantId) {
  const saleOrder = await prisma.saleOrder.findFirst({
    where: { id, tenantId },
    include: {
      items: {
        include: {
          item: {
            select: { 
              id: true, 
              name: true, 
              sku: true, 
              unit: true, 
              type: true,
              cost: true,
              price: true,
              stock: {
                include: {
                  warehouse: {
                    select: { id: true, name: true, code: true }
                  }
                }
              }
            }
          }
        }
      },
      transactions: {
        include: {
          item: {
            select: { id: true, name: true, sku: true }
          },
          warehouse: {
            select: { id: true, name: true, code: true }
          },
          createdBy: {
            select: { id: true, name: true, email: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  if (!saleOrder) return null;

  // Calculate detailed totals and profit analysis
  const totals = {
    totalAmount: saleOrder.items.reduce((sum, item) => 
      sum + (parseFloat(item.quantity) * parseFloat(item.unitPrice)), 0
    ),
    totalCost: saleOrder.items.reduce((sum, item) => 
      sum + (parseFloat(item.quantity) * parseFloat(item.item.cost || 0)), 0
    ),
    totalProfit: 0,
    profitMargin: 0
  };

  totals.totalProfit = totals.totalAmount - totals.totalCost;
  totals.profitMargin = totals.totalAmount > 0 ? (totals.totalProfit / totals.totalAmount) * 100 : 0;

  // Check stock availability for each item
  const stockAnalysis = saleOrder.items.map(item => {
    const totalStock = item.item.stock.reduce((sum, stock) => 
      sum + parseFloat(stock.quantity) - parseFloat(stock.reserved), 0
    );
    const orderedQuantity = parseFloat(item.quantity);
    
    return {
      item: item.item,
      orderedQuantity,
      availableStock: totalStock,
      canFulfill: totalStock >= orderedQuantity,
      shortage: Math.max(0, orderedQuantity - totalStock)
    };
  });

  const canFulfillAll = stockAnalysis.every(item => item.canFulfill);

  return {
    ...saleOrder,
    totals,
    stockAnalysis,
    fulfillmentStatus: {
      canFulfillAll,
      itemsWithShortage: stockAnalysis.filter(item => !item.canFulfill),
      totalShortage: stockAnalysis.reduce((sum, item) => sum + item.shortage, 0)
    }
  };
}

async function updateSaleOrder(id, tenantId, updateData) {
  const { items, ...restData } = updateData;

  // Check if SO can be updated (only if status is PENDING)
  const existingSO = await prisma.saleOrder.findFirst({
    where: { id, tenantId },
    select: { status: true }
  });

  if (!existingSO) {
    throw new ValidationError('Sale order not found');
  }

  if (existingSO.status !== SOStatus.PENDING) {
    throw new ValidationError('Only pending sale orders can be updated');
  }

  const saleOrder = await prisma.$transaction(async (tx) => {
    // Update basic info
    const updatedSO = await tx.saleOrder.update({
      where: { id, tenantId },
      data: restData
    });

    // Update items if provided
    if (items) {
      // Delete existing items
      await tx.sOItem.deleteMany({
        where: { soId: id }
      });

      // Create new items
      await tx.sOItem.createMany({
        data: items.map(item => ({
          soId: id,
          itemId: item.itemId,
          quantity: parseFloat(item.quantity),
          unitPrice: parseFloat(item.unitPrice)
        }))
      });
    }

    return updatedSO;
  });

  return await getSaleOrderById(id, tenantId);
}

async function cancelSaleOrder(id, tenantId) {
  const saleOrder = await prisma.saleOrder.findFirst({
    where: { id, tenantId },
    select: { status: true }
  });

  if (!saleOrder) {
    throw new ValidationError('Sale order not found');
  }

  if (saleOrder.status === SOStatus.CANCELLED) {
    throw new ValidationError('Sale order is already cancelled');
  }

  if (saleOrder.status === SOStatus.COMPLETED) {
    throw new ValidationError('Cannot cancel completed sale order');
  }

  const updatedSO = await prisma.saleOrder.update({
    where: { id, tenantId },
    data: { status: SOStatus.CANCELLED }
  });

  return updatedSO;
}

async function fulfillSaleOrder(saleOrderId, fulfilledItems, createdById) {
  // Use the inventory transaction service to process the fulfillment
  const transactions = await inventoryTransactionService.processSaleFulfillment(
    saleOrderId,
    fulfilledItems,
    createdById
  );

  return {
    transactions,
    message: 'Sale order fulfillment processed successfully'
  };
}

async function getSaleOrderItems(saleOrderId, tenantId) {
  const saleOrder = await prisma.saleOrder.findFirst({
    where: { id: saleOrderId, tenantId },
    include: {
      items: {
        include: {
          item: {
            select: { 
              id: true, 
              name: true, 
              sku: true, 
              unit: true, 
              type: true,
              cost: true,
              price: true,
              stock: {
                include: {
                  warehouse: {
                    select: { id: true, name: true, code: true }
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  if (!saleOrder) {
    throw new ValidationError('Sale order not found');
  }

  return saleOrder.items.map(item => {
    const totalStock = item.item.stock.reduce((sum, stock) => 
      sum + parseFloat(stock.quantity) - parseFloat(stock.reserved), 0
    );
    
    return {
      ...item,
      quantity: parseFloat(item.quantity),
      unitPrice: parseFloat(item.unitPrice),
      totalAmount: parseFloat(item.quantity) * parseFloat(item.unitPrice),
      availableStock: totalStock,
      canFulfill: totalStock >= parseFloat(item.quantity),
      stockByWarehouse: item.item.stock.map(stock => ({
        warehouse: stock.warehouse,
        quantity: parseFloat(stock.quantity),
        reserved: parseFloat(stock.reserved),
        available: parseFloat(stock.quantity) - parseFloat(stock.reserved)
      }))
    };
  });
}

// Enhanced sales analytics and management functions
async function getSalesAnalytics(tenantId, options = {}) {
  const { 
    startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    endDate = new Date(),
    groupBy = 'day'
  } = options;

  const where = {
    tenantId,
    createdAt: { gte: startDate, lte: endDate }
  };

  const saleOrders = await prisma.saleOrder.findMany({
    where,
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
  const groupedSales = {};
  saleOrders.forEach(order => {
    let groupKey;
    const date = new Date(order.createdAt);
    
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

    if (!groupedSales[groupKey]) {
      groupedSales[groupKey] = {
        period: groupKey,
        orders: 0,
        totalRevenue: 0,
        totalCost: 0,
        totalProfit: 0,
        totalItems: 0,
        uniqueCustomers: new Set()
      };
    }

    const orderRevenue = order.items.reduce((sum, item) => 
      sum + (parseFloat(item.quantity) * parseFloat(item.unitPrice)), 0
    );
    const orderCost = order.items.reduce((sum, item) => 
      sum + (parseFloat(item.quantity) * parseFloat(item.item.cost || 0)), 0
    );
    const orderProfit = orderRevenue - orderCost;

    groupedSales[groupKey].orders += 1;
    groupedSales[groupKey].totalRevenue += orderRevenue;
    groupedSales[groupKey].totalCost += orderCost;
    groupedSales[groupKey].totalProfit += orderProfit;
    groupedSales[groupKey].totalItems += order.items.length;
    groupedSales[groupKey].uniqueCustomers.add(order.customer);
  });

  // Convert to array and add calculated metrics
  const analytics = Object.values(groupedSales).map(group => ({
    ...group,
    uniqueCustomersCount: group.uniqueCustomers.size,
    averageOrderValue: group.orders > 0 ? group.totalRevenue / group.orders : 0,
    profitMargin: group.totalRevenue > 0 ? (group.totalProfit / group.totalRevenue) * 100 : 0
  }));

  // Calculate summary statistics
  const summary = {
    totalOrders: saleOrders.length,
    totalRevenue: analytics.reduce((sum, a) => sum + a.totalRevenue, 0),
    totalCost: analytics.reduce((sum, a) => sum + a.totalCost, 0),
    totalProfit: analytics.reduce((sum, a) => sum + a.totalProfit, 0),
    averageOrderValue: saleOrders.length > 0 
      ? analytics.reduce((sum, a) => sum + a.totalRevenue, 0) / saleOrders.length 
      : 0,
    profitMargin: analytics.reduce((sum, a) => sum + a.totalRevenue, 0) > 0 
      ? (analytics.reduce((sum, a) => sum + a.totalProfit, 0) / analytics.reduce((sum, a) => sum + a.totalRevenue, 0)) * 100 
      : 0
  };

  return {
    analytics,
    summary,
    period: { startDate, endDate },
    groupBy
  };
}

async function getSalesPerformanceMetrics(tenantId, options = {}) {
  const { period = 30 } = options;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);

  const saleOrders = await prisma.saleOrder.findMany({
    where: {
      tenantId,
      createdAt: { gte: startDate },
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
    }
  });

  // Calculate performance metrics
  const totalRevenue = saleOrders.reduce((sum, order) => 
    sum + order.items.reduce((itemSum, item) => 
      itemSum + (parseFloat(item.quantity) * parseFloat(item.unitPrice)), 0
    ), 0
  );

  const totalCost = saleOrders.reduce((sum, order) => 
    sum + order.items.reduce((itemSum, item) => 
      itemSum + (parseFloat(item.quantity) * parseFloat(item.item.cost || 0)), 0
    ), 0
  );

  const totalProfit = totalRevenue - totalCost;
  const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  // Calculate sales by item type
  const salesByType = {};
  saleOrders.forEach(order => {
    order.items.forEach(item => {
      const type = item.item.type;
      if (!salesByType[type]) {
        salesByType[type] = { revenue: 0, cost: 0, quantity: 0, orders: 0 };
      }
      salesByType[type].revenue += parseFloat(item.quantity) * parseFloat(item.unitPrice);
      salesByType[type].cost += parseFloat(item.quantity) * parseFloat(item.item.cost || 0);
      salesByType[type].quantity += parseFloat(item.quantity);
      salesByType[type].orders += 1;
    });
  });

  // Calculate customer metrics
  const uniqueCustomers = new Set(saleOrders.map(order => order.customer));
  const averageOrderValue = saleOrders.length > 0 ? totalRevenue / saleOrders.length : 0;

  return {
    period,
    metrics: {
      totalOrders: saleOrders.length,
      totalRevenue,
      totalCost,
      totalProfit,
      profitMargin: Math.round(profitMargin * 100) / 100,
      uniqueCustomers: uniqueCustomers.size,
      averageOrderValue: Math.round(averageOrderValue * 100) / 100,
      salesByType,
      dailyAverage: {
        orders: Math.round((saleOrders.length / period) * 100) / 100,
        revenue: Math.round((totalRevenue / period) * 100) / 100,
        profit: Math.round((totalProfit / period) * 100) / 100
      }
    }
  };
}

async function getTopSellingItems(tenantId, options = {}) {
  const { 
    limit = 10,
    startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    endDate = new Date(),
    criteria = 'revenue'
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
    }
  });

  // Aggregate item sales
  const itemSales = {};
  saleOrders.forEach(order => {
    order.items.forEach(item => {
      const itemId = item.itemId;
      if (!itemSales[itemId]) {
        itemSales[itemId] = {
          item: item.item,
          totalQuantity: 0,
          totalRevenue: 0,
          totalCost: 0,
          totalProfit: 0,
          orderCount: 0
        };
      }

      const quantity = parseFloat(item.quantity);
      const revenue = quantity * parseFloat(item.unitPrice);
      const cost = quantity * parseFloat(item.item.cost || 0);

      itemSales[itemId].totalQuantity += quantity;
      itemSales[itemId].totalRevenue += revenue;
      itemSales[itemId].totalCost += cost;
      itemSales[itemId].totalProfit += (revenue - cost);
      itemSales[itemId].orderCount += 1;
    });
  });

  // Convert to array and sort by criteria
  const topItems = Object.values(itemSales).map(item => ({
    ...item,
    averageOrderValue: item.orderCount > 0 ? item.totalRevenue / item.orderCount : 0,
    profitMargin: item.totalRevenue > 0 ? (item.totalProfit / item.totalRevenue) * 100 : 0
  }));

  const sortedItems = topItems.sort((a, b) => {
    switch (criteria) {
      case 'revenue':
        return b.totalRevenue - a.totalRevenue;
      case 'quantity':
        return b.totalQuantity - a.totalQuantity;
      case 'profit':
        return b.totalProfit - a.totalProfit;
      case 'orders':
        return b.orderCount - a.orderCount;
      default:
        return b.totalRevenue - a.totalRevenue;
    }
  });

  return sortedItems.slice(0, limit);
}

async function getSalesForecast(tenantId, options = {}) {
  const { 
    forecastPeriod = 30,
    historicalPeriod = 90
  } = options;

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - historicalPeriod);

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
            select: { id: true, name: true, sku: true, type: true }
          }
        }
      }
    },
    orderBy: { createdAt: 'asc' }
  });

  // Calculate historical trends
  const dailySales = {};
  saleOrders.forEach(order => {
    const dayKey = order.createdAt.toISOString().slice(0, 10);
    if (!dailySales[dayKey]) {
      dailySales[dayKey] = { revenue: 0, orders: 0, items: 0 };
    }
    
    dailySales[dayKey].revenue += order.items.reduce((sum, item) => 
      sum + (parseFloat(item.quantity) * parseFloat(item.unitPrice)), 0
    );
    dailySales[dayKey].orders += 1;
    dailySales[dayKey].items += order.items.length;
  });

  const dailyValues = Object.values(dailySales);
  const averageDailyRevenue = dailyValues.length > 0 
    ? dailyValues.reduce((sum, day) => sum + day.revenue, 0) / dailyValues.length 
    : 0;
  const averageDailyOrders = dailyValues.length > 0 
    ? dailyValues.reduce((sum, day) => sum + day.orders, 0) / dailyValues.length 
    : 0;

  // Simple linear trend calculation
  const trend = calculateTrend(dailyValues.map(day => day.revenue));

  // Generate forecast
  const forecast = [];
  for (let i = 1; i <= forecastPeriod; i++) {
    const forecastDate = new Date();
    forecastDate.setDate(forecastDate.getDate() + i);
    
    const forecastRevenue = averageDailyRevenue + (trend * i);
    const forecastOrders = averageDailyOrders;

    forecast.push({
      date: forecastDate.toISOString().slice(0, 10),
      forecastedRevenue: Math.round(forecastRevenue * 100) / 100,
      forecastedOrders: Math.round(forecastOrders * 100) / 100,
      confidence: Math.max(0, 100 - (i * 2)) // Decreasing confidence over time
    });
  }

  return {
    forecast,
    historicalData: {
      period: historicalPeriod,
      averageDailyRevenue: Math.round(averageDailyRevenue * 100) / 100,
      averageDailyOrders: Math.round(averageDailyOrders * 100) / 100,
      trend: Math.round(trend * 100) / 100,
      totalHistoricalRevenue: dailyValues.reduce((sum, day) => sum + day.revenue, 0)
    },
    forecastPeriod
  };
}

function calculateTrend(values) {
  if (values.length < 2) return 0;
  
  const n = values.length;
  const xSum = (n * (n - 1)) / 2;
  const ySum = values.reduce((sum, val) => sum + val, 0);
  const xySum = values.reduce((sum, val, index) => sum + (index * val), 0);
  const xSquaredSum = (n * (n - 1) * (2 * n - 1)) / 6;
  
  const slope = (n * xySum - xSum * ySum) / (n * xSquaredSum - xSum * xSum);
  return slope;
}

async function getSalesOptimizationRecommendations(tenantId, options = {}) {
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

  const recommendations = [];

  // Analyze pricing opportunities
  const itemAnalysis = {};
  saleOrders.forEach(order => {
    order.items.forEach(item => {
      const itemId = item.itemId;
      if (!itemAnalysis[itemId]) {
        itemAnalysis[itemId] = {
          item: item.item,
          totalSold: 0,
          totalRevenue: 0,
          averagePrice: 0,
          pricePoints: []
        };
      }

      const quantity = parseFloat(item.quantity);
      const price = parseFloat(item.unitPrice);
      
      itemAnalysis[itemId].totalSold += quantity;
      itemAnalysis[itemId].totalRevenue += quantity * price;
      itemAnalysis[itemId].pricePoints.push(price);
    });
  });

  // Generate pricing recommendations
  Object.values(itemAnalysis).forEach(item => {
    const averagePrice = item.totalRevenue / item.totalSold;
    const listPrice = parseFloat(item.item.price || 0);
    const cost = parseFloat(item.item.cost || 0);
    
    if (listPrice > 0 && averagePrice < listPrice * 0.9) {
      recommendations.push({
        type: 'PRICING',
        priority: 'MEDIUM',
        title: 'Price Optimization Opportunity',
        description: `${item.item.name} is selling below list price`,
        impact: 'Revenue increase potential',
        recommendation: `Consider increasing price from ${averagePrice.toFixed(2)} to ${listPrice.toFixed(2)}`,
        expectedBenefit: `Potential revenue increase of ${((listPrice - averagePrice) * item.totalSold).toFixed(2)}`,
        item: item.item
      });
    }

    if (cost > 0 && averagePrice < cost * 1.2) {
      recommendations.push({
        type: 'MARGIN',
        priority: 'HIGH',
        title: 'Low Margin Alert',
        description: `${item.item.name} has low profit margin`,
        impact: 'Profitability concern',
        recommendation: 'Review pricing strategy or cost structure',
        expectedBenefit: 'Improved profitability',
        item: item.item
      });
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

  // Identify upselling opportunities
  const frequentCustomers = Object.entries(customerOrders)
    .filter(([customer, orders]) => orders.length >= 3)
    .map(([customer, orders]) => ({ customer, orders }));

  if (frequentCustomers.length > 0) {
    recommendations.push({
      type: 'UPSELLING',
      priority: 'MEDIUM',
      title: 'Upselling Opportunity',
      description: `${frequentCustomers.length} customers with frequent orders`,
      impact: 'Revenue growth potential',
      recommendation: 'Implement customer-specific upselling strategies',
      expectedBenefit: 'Increased average order value',
      customers: frequentCustomers.slice(0, 5).map(c => c.customer)
    });
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

module.exports = {
  createSaleOrder,
  getSaleOrders,
  getSaleOrderById,
  updateSaleOrder,
  cancelSaleOrder,
  fulfillSaleOrder,
  getSaleOrderItems,
  getSalesAnalytics,
  getSalesPerformanceMetrics,
  getTopSellingItems,
  getSalesForecast,
  getSalesOptimizationRecommendations
};
