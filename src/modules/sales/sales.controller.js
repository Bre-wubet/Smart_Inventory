const salesService = require('./sales.service');
const { ValidationError, NotFoundError } = require('../../core/exceptions');
const { PAGINATION } = require('../../core/constants');

/**
 * Sales Controller - Comprehensive Sales Management and Analytics API
 * 
 * This controller provides endpoints for managing sales orders and advanced analytics:
 * 
 * BASIC SALES OPERATIONS:
 * - POST /sales/sale-orders - Create new sale order
 * - GET /sales/sale-orders - List sale orders with pagination and filtering
 * - GET /sales/sale-orders/:id - Get specific sale order details
 * - PUT /sales/sale-orders/:id - Update sale order
 * - DELETE /sales/sale-orders/:id/cancel - Cancel sale order
 * - POST /sales/sale-orders/:id/fulfill - Fulfill sale order
 * - GET /sales/sale-orders/:id/items - Get sale order items
 * 
 * ENHANCED SALES ANALYTICS:
 * - GET /sales/analytics - Comprehensive sales analytics dashboard
 * - GET /sales/performance - Sales performance metrics
 * - GET /sales/top-items - Top selling items analysis
 * - GET /sales/forecast - Sales forecasting with trend analysis
 * - GET /sales/optimization-recommendations - Pricing and optimization recommendations
 * 
 * ADVANCED SALES ANALYTICS:
 * - GET /sales/trends - Advanced sales trends analysis
 * - GET /sales/customer-behavior - Customer behavior patterns and segmentation
 * - GET /sales/product-performance - Detailed product performance analysis
 * - GET /sales/insights - AI-powered sales insights and recommendations
 * 
 * All endpoints support query parameters for date ranges, grouping, and filtering.
 * All endpoints require authentication and tenant access.
 */

async function createSaleOrder(req, res, next) {
  try {
    const { customer, items, reference } = req.body;
    const tenantId = req.tenantId;

    if (!customer || !items || !Array.isArray(items) || items.length === 0) {
      throw new ValidationError('customer and items are required');
    }

    const saleOrder = await salesService.createSaleOrder({
      customer,
      items,
      reference,
      tenantId
    });

    res.status(201).json({ success: true, data: saleOrder });
  } catch (err) {
    next(err);
  }
}

async function getSaleOrders(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
    const search = req.query.search;
    const customer = req.query.customer;
    const status = req.query.status;

    const result = await salesService.getSaleOrders({
      tenantId,
      page,
      limit,
      search,
      customer,
      status
    });

    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function getSaleOrderById(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const saleOrder = await salesService.getSaleOrderById(id, tenantId);
    if (!saleOrder) {
      throw new NotFoundError('Sale order not found');
    }

    res.json({ success: true, data: saleOrder });
  } catch (err) {
    next(err);
  }
}

async function updateSaleOrder(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const updateData = req.body;

    const saleOrder = await salesService.updateSaleOrder(id, tenantId, updateData);
    if (!saleOrder) {
      throw new NotFoundError('Sale order not found');
    }

    res.json({ success: true, data: saleOrder });
  } catch (err) {
    next(err);
  }
}

async function cancelSaleOrder(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const saleOrder = await salesService.cancelSaleOrder(id, tenantId);
    if (!saleOrder) {
      throw new NotFoundError('Sale order not found');
    }

    res.json({ success: true, data: saleOrder });
  } catch (err) {
    next(err);
  }
}

async function fulfillSaleOrder(req, res, next) {
  try {
    const { id } = req.params;
    const { fulfilledItems } = req.body;
    const createdById = req.user.id;

    if (!fulfilledItems || !Array.isArray(fulfilledItems) || fulfilledItems.length === 0) {
      throw new ValidationError('fulfilledItems array is required');
    }

    const result = await salesService.fulfillSaleOrder(id, fulfilledItems, createdById);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getSaleOrderItems(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const items = await salesService.getSaleOrderItems(id, tenantId);
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
}

// Enhanced sales analytics and management functions
async function getSalesAnalytics(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { 
      startDate, 
      endDate, 
      groupBy = 'day' 
    } = req.query;

    const options = {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      groupBy
    };

    const analytics = await salesService.getSalesAnalytics(tenantId, options);
    res.json({ success: true, data: analytics });
  } catch (err) {
    next(err);
  }
}

async function getSalesPerformanceMetrics(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { period = 30 } = req.query;

    const options = { period: parseInt(period) };
    const metrics = await salesService.getSalesPerformanceMetrics(tenantId, options);
    res.json({ success: true, data: metrics });
  } catch (err) {
    next(err);
  }
}

async function getTopSellingItems(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { 
      limit = 10,
      criteria = 'revenue',
      startDate,
      endDate
    } = req.query;

    const options = {
      limit: parseInt(limit),
      criteria,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined
    };

    const topItems = await salesService.getTopSellingItems(tenantId, options);
    res.json({ success: true, data: topItems });
  } catch (err) {
    next(err);
  }
}

async function getSalesForecast(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { 
      forecastPeriod = 30,
      historicalPeriod = 90
    } = req.query;

    const options = {
      forecastPeriod: parseInt(forecastPeriod),
      historicalPeriod: parseInt(historicalPeriod)
    };

    const forecast = await salesService.getSalesForecast(tenantId, options);
    res.json({ success: true, data: forecast });
  } catch (err) {
    next(err);
  }
}

async function getSalesOptimizationRecommendations(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { 
      startDate,
      endDate
    } = req.query;

    const options = {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined
    };

    const recommendations = await salesService.getSalesOptimizationRecommendations(tenantId, options);
    res.json({ success: true, data: recommendations });
  } catch (err) {
    next(err);
  }
}

// Advanced Sales Analytics Controllers
async function getSalesTrendsAnalysis(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { 
      startDate, 
      endDate, 
      groupBy = 'month' 
    } = req.query;

    const options = {};
    if (startDate) options.startDate = new Date(startDate);
    if (endDate) options.endDate = new Date(endDate);
    if (groupBy) options.groupBy = groupBy;

    const salesAnalyticsService = require('./sales-analytics.service');
    const result = await salesAnalyticsService.analyzeSalesTrends(tenantId, options);

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getCustomerBehaviorAnalysis(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { 
      startDate, 
      endDate 
    } = req.query;

    const options = {};
    if (startDate) options.startDate = new Date(startDate);
    if (endDate) options.endDate = new Date(endDate);

    const salesAnalyticsService = require('./sales-analytics.service');
    const result = await salesAnalyticsService.analyzeCustomerBehavior(tenantId, options);

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getProductPerformanceAnalysis(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { 
      startDate, 
      endDate, 
      groupBy = 'item' 
    } = req.query;

    const options = {};
    if (startDate) options.startDate = new Date(startDate);
    if (endDate) options.endDate = new Date(endDate);
    if (groupBy) options.groupBy = groupBy;

    const salesAnalyticsService = require('./sales-analytics.service');
    const result = await salesAnalyticsService.analyzeProductPerformance(tenantId, options);

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getSalesInsights(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { 
      startDate, 
      endDate 
    } = req.query;

    const options = {};
    if (startDate) options.startDate = new Date(startDate);
    if (endDate) options.endDate = new Date(endDate);

    const salesAnalyticsService = require('./sales-analytics.service');
    const result = await salesAnalyticsService.generateSalesInsights(tenantId, options);

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
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
  getSalesOptimizationRecommendations,
  // Advanced Analytics Controllers
  getSalesTrendsAnalysis,
  getCustomerBehaviorAnalysis,
  getProductPerformanceAnalysis,
  getSalesInsights
};
