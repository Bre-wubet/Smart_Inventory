const analyticsService = require('./analytics.service');
const { ValidationError, NotFoundError } = require('../../core/exceptions');
const { PAGINATION } = require('../../core/constants');

async function getDashboardMetrics(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { period = '30' } = req.query;

    const metrics = await analyticsService.getDashboardMetrics(tenantId, parseInt(period));
    res.json({ success: true, data: metrics });
  } catch (err) {
    next(err);
  }
}

async function getInventoryAnalytics(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { startDate, endDate, warehouseId, itemId } = req.query;

    if (!startDate || !endDate) {
      throw new ValidationError('startDate and endDate are required');
    }

    const analytics = await analyticsService.getInventoryAnalytics({
      tenantId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      warehouseId,
      itemId
    });

    res.json({ success: true, data: analytics });
  } catch (err) {
    next(err);
  }
}

async function getSalesAnalytics(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { startDate, endDate, customer, itemId, groupBy = 'day' } = req.query;

    if (!startDate || !endDate) {
      throw new ValidationError('startDate and endDate are required');
    }

    const analytics = await analyticsService.getSalesAnalytics({
      tenantId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      customer,
      itemId,
      groupBy
    });

    res.json({ success: true, data: analytics });
  } catch (err) {
    next(err);
  }
}

async function getPurchaseAnalytics(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { startDate, endDate, supplierId, itemId, groupBy = 'day' } = req.query;

    if (!startDate || !endDate) {
      throw new ValidationError('startDate and endDate are required');
    }

    const analytics = await analyticsService.getPurchaseAnalytics({
      tenantId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      supplierId,
      itemId,
      groupBy
    });

    res.json({ success: true, data: analytics });
  } catch (err) {
    next(err);
  }
}

async function getStockMovementAnalytics(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { startDate, endDate, warehouseId, itemId, type } = req.query;

    if (!startDate || !endDate) {
      throw new ValidationError('startDate and endDate are required');
    }

    const analytics = await analyticsService.getStockMovementAnalytics({
      tenantId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      warehouseId,
      itemId,
      type
    });

    res.json({ success: true, data: analytics });
  } catch (err) {
    next(err);
  }
}

async function getTopSellingItems(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { startDate, endDate, limit = 10, warehouseId } = req.query;

    if (!startDate || !endDate) {
      throw new ValidationError('startDate and endDate are required');
    }

    const items = await analyticsService.getTopSellingItems({
      tenantId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      limit: parseInt(limit),
      warehouseId
    });

    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
}

async function getSlowMovingItems(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { startDate, endDate, limit = 10, warehouseId } = req.query;

    if (!startDate || !endDate) {
      throw new ValidationError('startDate and endDate are required');
    }

    const items = await analyticsService.getSlowMovingItems({
      tenantId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      limit: parseInt(limit),
      warehouseId
    });

    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
}

async function getSupplierPerformance(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { startDate, endDate, limit = 10 } = req.query;

    if (!startDate || !endDate) {
      throw new ValidationError('startDate and endDate are required');
    }

    const suppliers = await analyticsService.getSupplierPerformance({
      tenantId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      limit: parseInt(limit)
    });

    res.json({ success: true, data: suppliers });
  } catch (err) {
    next(err);
  }
}

async function getCustomerAnalytics(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { startDate, endDate, limit = 10 } = req.query;

    if (!startDate || !endDate) {
      throw new ValidationError('startDate and endDate are required');
    }

    const customers = await analyticsService.getCustomerAnalytics({
      tenantId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      limit: parseInt(limit)
    });

    res.json({ success: true, data: customers });
  } catch (err) {
    next(err);
  }
}

async function getWarehouseAnalytics(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { startDate, endDate, warehouseId } = req.query;

    if (!startDate || !endDate) {
      throw new ValidationError('startDate and endDate are required');
    }

    const analytics = await analyticsService.getWarehouseAnalytics({
      tenantId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      warehouseId
    });

    res.json({ success: true, data: analytics });
  } catch (err) {
    next(err);
  }
}

async function getProfitLossAnalysis(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { startDate, endDate, groupBy = 'month' } = req.query;

    if (!startDate || !endDate) {
      throw new ValidationError('startDate and endDate are required');
    }

    const analysis = await analyticsService.getProfitLossAnalysis({
      tenantId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      groupBy
    });

    res.json({ success: true, data: analysis });
  } catch (err) {
    next(err);
  }
}

async function getTrendAnalysis(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { metric, period = '90', groupBy = 'day' } = req.query;

    if (!metric) {
      throw new ValidationError('metric is required');
    }

    const trends = await analyticsService.getTrendAnalysis({
      tenantId,
      metric,
      period: parseInt(period),
      groupBy
    });

    res.json({ success: true, data: trends });
  } catch (err) {
    next(err);
  }
}

async function generateCustomReport(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { reportType, parameters } = req.body;

    if (!reportType) {
      throw new ValidationError('reportType is required');
    }

    const report = await analyticsService.generateCustomReport({
      tenantId,
      reportType,
      parameters
    });

    res.json({ success: true, data: report });
  } catch (err) {
    next(err);
  }
}

async function getAnalyticsLogs(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { type, limit, offset } = req.query;

    const logs = await analyticsService.getAnalyticsLogs({
      tenantId,
      type,
      limit: parseInt(limit) || PAGINATION.DEFAULT_LIMIT,
      offset: parseInt(offset) || 0
    });

    res.json({ success: true, data: logs });
  } catch (err) {
    next(err);
  }
}

async function logAnalyticsEvent(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { eventType, eventData, userId } = req.body;

    if (!eventType) {
      throw new ValidationError('eventType is required');
    }

    const log = await analyticsService.logAnalyticsEvent({
      tenantId,
      eventType,
      eventData,
      userId: userId || req.user.id
    });

    res.status(201).json({ success: true, data: log });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getDashboardMetrics,
  getInventoryAnalytics,
  getSalesAnalytics,
  getPurchaseAnalytics,
  getStockMovementAnalytics,
  getTopSellingItems,
  getSlowMovingItems,
  getSupplierPerformance,
  getCustomerAnalytics,
  getWarehouseAnalytics,
  getProfitLossAnalysis,
  getTrendAnalysis,
  generateCustomReport,
  getAnalyticsLogs,
  logAnalyticsEvent
};
