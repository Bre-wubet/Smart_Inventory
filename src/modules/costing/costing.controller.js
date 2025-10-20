const costingService = require('./costing.service');
const { ValidationError, NotFoundError } = require('../../core/exceptions');
const { PAGINATION } = require('../../core/constants');

async function getInventoryValuation(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const warehouseId = req.query.warehouseId;
    const method = req.query.method || 'FIFO'; // FIFO, LIFO, Weighted Average

    const valuation = await costingService.getInventoryValuation({
      tenantId,
      warehouseId,
      method
    });

    res.json({ success: true, data: valuation });
  } catch (err) {
    next(err);
  }
}

async function getCostAnalysis(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const itemId = req.query.itemId;
    const period = req.query.period || '30'; // days
    const warehouseId = req.query.warehouseId;

    const analysis = await costingService.getCostAnalysis({
      tenantId,
      itemId,
      period: parseInt(period),
      warehouseId
    });

    res.json({ success: true, data: analysis });
  } catch (err) {
    next(err);
  }
}

async function getProfitAnalysis(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const itemId = req.query.itemId;
    const customer = req.query.customer;

    if (!startDate || !endDate) {
      throw new ValidationError('startDate and endDate are required');
    }

    const analysis = await costingService.getProfitAnalysis({
      tenantId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      itemId,
      customer
    });

    res.json({ success: true, data: analysis });
  } catch (err) {
    next(err);
  }
}

async function getRecipeCostAnalysis(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const recipeId = req.params.id;

    const analysis = await costingService.getRecipeCostAnalysis(recipeId, tenantId);
    res.json({ success: true, data: analysis });
  } catch (err) {
    next(err);
  }
}

async function getProductionCostAnalysis(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const batchId = req.params.id;

    const analysis = await costingService.getProductionCostAnalysis(batchId, tenantId);
    res.json({ success: true, data: analysis });
  } catch (err) {
    next(err);
  }
}

async function getSupplierCostComparison(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const itemId = req.params.id;

    const comparison = await costingService.getSupplierCostComparison(itemId, tenantId);
    res.json({ success: true, data: comparison });
  } catch (err) {
    next(err);
  }
}

async function getCostTrends(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const itemId = req.query.itemId;
    const period = req.query.period || '90'; // days
    const warehouseId = req.query.warehouseId;

    const trends = await costingService.getCostTrends({
      tenantId,
      itemId,
      period: parseInt(period),
      warehouseId
    });

    res.json({ success: true, data: trends });
  } catch (err) {
    next(err);
  }
}

async function getMarginAnalysis(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const groupBy = req.query.groupBy || 'item'; // item, customer, category

    if (!startDate || !endDate) {
      throw new ValidationError('startDate and endDate are required');
    }

    const analysis = await costingService.getMarginAnalysis({
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

async function generateCostReport(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { reportType, parameters } = req.body;

    if (!reportType) {
      throw new ValidationError('reportType is required');
    }

    const report = await costingService.generateCostReport({
      tenantId,
      reportType,
      parameters
    });

    res.json({ success: true, data: report });
  } catch (err) {
    next(err);
  }
}

// Advanced Cost Analytics Controllers
async function getCostAnalyticsDashboard(req, res, next) {
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

    const dashboard = await costingService.getCostAnalyticsDashboard(tenantId, options);
    res.json({ success: true, data: dashboard });
  } catch (err) {
    next(err);
  }
}

async function getCostOptimizationRecommendations(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { 
      startDate, 
      endDate, 
      focus = 'all' 
    } = req.query;

    const options = {};
    if (startDate) options.startDate = new Date(startDate);
    if (endDate) options.endDate = new Date(endDate);
    if (focus) options.focus = focus;

    const recommendations = await costingService.getCostOptimizationRecommendations(tenantId, options);
    res.json({ success: true, data: recommendations });
  } catch (err) {
    next(err);
  }
}

async function getCostForecast(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { 
      forecastPeriod = '30', 
      confidenceLevel = '95',
      itemId,
      category 
    } = req.query;

    const options = {};
    if (forecastPeriod) options.forecastPeriod = parseInt(forecastPeriod);
    if (confidenceLevel) options.confidenceLevel = parseInt(confidenceLevel);
    if (itemId) options.itemId = itemId;
    if (category) options.category = category;

    const forecast = await costingService.getCostForecast(tenantId, options);
    res.json({ success: true, data: forecast });
  } catch (err) {
    next(err);
  }
}

async function getCostBenchmarking(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { 
      benchmarkType = 'industry',
      category,
      itemId 
    } = req.query;

    const options = {};
    if (benchmarkType) options.benchmarkType = benchmarkType;
    if (category) options.category = category;
    if (itemId) options.itemId = itemId;

    const benchmarking = await costingService.getCostBenchmarking(tenantId, options);
    res.json({ success: true, data: benchmarking });
  } catch (err) {
    next(err);
  }
}

// Advanced Cost Analytics Service Controllers
async function getCostVarianceAnalysis(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { 
      startDate, 
      endDate, 
      itemId,
      category 
    } = req.query;

    const options = {};
    if (startDate) options.startDate = new Date(startDate);
    if (endDate) options.endDate = new Date(endDate);
    if (itemId) options.itemId = itemId;
    if (category) options.category = category;

    const costingAnalyticsService = require('./costing-analytics.service');
    const analysis = await costingAnalyticsService.getCostVarianceAnalysis(tenantId, options);
    res.json({ success: true, data: analysis });
  } catch (err) {
    next(err);
  }
}

async function getCostCenterAnalysis(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { 
      startDate, 
      endDate, 
      groupBy = 'category' 
    } = req.query;

    const options = {};
    if (startDate) options.startDate = new Date(startDate);
    if (endDate) options.endDate = new Date(endDate);
    if (groupBy) options.groupBy = groupBy;

    const costingAnalyticsService = require('./costing-analytics.service');
    const analysis = await costingAnalyticsService.getCostCenterAnalysis(tenantId, options);
    res.json({ success: true, data: analysis });
  } catch (err) {
    next(err);
  }
}

async function getCostImpactAnalysis(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { 
      startDate, 
      endDate, 
      impactType = 'profit' 
    } = req.query;

    const options = {};
    if (startDate) options.startDate = new Date(startDate);
    if (endDate) options.endDate = new Date(endDate);
    if (impactType) options.impactType = impactType;

    const costingAnalyticsService = require('./costing-analytics.service');
    const analysis = await costingAnalyticsService.getCostImpactAnalysis(tenantId, options);
    res.json({ success: true, data: analysis });
  } catch (err) {
    next(err);
  }
}

async function getCostOptimizationOpportunities(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { 
      startDate, 
      endDate, 
      opportunityType = 'all' 
    } = req.query;

    const options = {};
    if (startDate) options.startDate = new Date(startDate);
    if (endDate) options.endDate = new Date(endDate);
    if (opportunityType) options.opportunityType = opportunityType;

    const costingAnalyticsService = require('./costing-analytics.service');
    const opportunities = await costingAnalyticsService.getCostOptimizationOpportunities(tenantId, options);
    res.json({ success: true, data: opportunities });
  } catch (err) {
    next(err);
  }
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
  // Advanced Analytics Controllers
  getCostAnalyticsDashboard,
  getCostOptimizationRecommendations,
  getCostForecast,
  getCostBenchmarking,
  // Advanced Analytics Service Controllers
  getCostVarianceAnalysis,
  getCostCenterAnalysis,
  getCostImpactAnalysis,
  getCostOptimizationOpportunities
};
