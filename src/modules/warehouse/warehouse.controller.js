/**
 * Warehouse Controller
 * 
 * Comprehensive warehouse management and analytics controller providing:
 * 
 * Basic Operations:
 * - POST /warehouses - Create warehouse
 * - GET /warehouses - List warehouses with pagination and search
 * - GET /warehouses/:id - Get warehouse details with stock summary
 * - PUT /warehouses/:id - Update warehouse
 * - DELETE /warehouses/:id - Delete warehouse
 * 
 * Stock Management:
 * - GET /warehouses/:id/stock - Get warehouse stock with pagination
 * - GET /warehouses/:id/transactions - Get warehouse transactions
 * - POST /transfer - Transfer stock between warehouses
 * - POST /adjust - Adjust stock quantities
 * 
 * Enhanced Analytics:
 * - GET /warehouses/analytics - Comprehensive warehouse analytics dashboard
 * - GET /warehouses/:id/performance - Individual warehouse performance metrics
 * - GET /warehouses/capacity-analysis - Capacity utilization analysis
 * - POST /warehouses/optimize - Inventory optimization recommendations
 * - GET /warehouses/movement-analytics - Stock movement trends and patterns
 * - GET /warehouses/cost-analysis - Cost analysis and optimization insights
 * 
 * Advanced Analytics:
 * - GET /warehouses/:id/efficiency - Detailed efficiency analysis
 * - GET /warehouses/bottlenecks - Bottleneck identification and analysis
 * - GET /warehouses/cost-efficiency - Cost efficiency analysis
 * - POST /warehouses/optimization-recommendations - Comprehensive optimization recommendations
 * - GET /warehouses/performance-trends - Performance trend analysis over time
 */

const warehouseService = require('./warehouse.service');
const warehouseAnalyticsService = require('./warehouse-analytics.service');
const { ValidationError, NotFoundError } = require('../../core/exceptions');
const { PAGINATION } = require('../../core/constants');

async function createWarehouse(req, res, next) {
  try {
    const { name, code, location } = req.body;
    const tenantId = req.tenantId;

    if (!name) {
      throw new ValidationError('Warehouse name is required');
    }

    const warehouse = await warehouseService.createWarehouse({
      name,
      code,
      location,
      tenantId
    });

    res.status(201).json({ success: true, data: warehouse });
  } catch (err) {
    next(err);
  }
}

async function getWarehouses(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
    const search = req.query.search;

    const result = await warehouseService.getWarehouses({
      tenantId,
      page,
      limit,
      search
    });

    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function getWarehouseById(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const warehouse = await warehouseService.getWarehouseById(id, tenantId);
    if (!warehouse) {
      throw new NotFoundError('Warehouse not found');
    }

    res.json({ success: true, data: warehouse });
  } catch (err) {
    next(err);
  }
}

async function updateWarehouse(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const updateData = req.body;

    const warehouse = await warehouseService.updateWarehouse(id, tenantId, updateData);
    if (!warehouse) {
      throw new NotFoundError('Warehouse not found');
    }

    res.json({ success: true, data: warehouse });
  } catch (err) {
    next(err);
  }
}

async function deleteWarehouse(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const deleted = await warehouseService.deleteWarehouse(id, tenantId);
    if (!deleted) {
      throw new NotFoundError('Warehouse not found');
    }

    res.json({ success: true, message: 'Warehouse deleted successfully' });
  } catch (err) {
    next(err);
  }
}

async function getWarehouseStock(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);

    const result = await warehouseService.getWarehouseStock(id, tenantId, { page, limit });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function getWarehouseTransactions(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);

    const result = await warehouseService.getWarehouseTransactions(id, tenantId, { page, limit });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function transferStock(req, res, next) {
  try {
    const { fromWarehouseId, toWarehouseId, itemId, quantity, note } = req.body;
    const createdById = req.user.id;

    if (!fromWarehouseId || !toWarehouseId || !itemId || !quantity) {
      throw new ValidationError('fromWarehouseId, toWarehouseId, itemId, and quantity are required');
    }

    if (fromWarehouseId === toWarehouseId) {
      throw new ValidationError('Source and destination warehouses cannot be the same');
    }

    const result = await warehouseService.transferStock({
      fromWarehouseId,
      toWarehouseId,
      itemId,
      quantity: parseFloat(quantity),
      note,
      createdById
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function adjustStock(req, res, next) {
  try {
    const { warehouseId, itemId, quantity, reason, note } = req.body;
    const createdById = req.user.id;

    if (!warehouseId || !itemId || quantity === undefined) {
      throw new ValidationError('warehouseId, itemId, and quantity are required');
    }

    const result = await warehouseService.adjustStock({
      warehouseId,
      itemId,
      quantity: parseFloat(quantity),
      reason,
      note,
      createdById
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// Enhanced warehouse analytics and management functions
async function getWarehouseAnalytics(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { 
      startDate, 
      endDate, 
      warehouseId 
    } = req.query;

    const options = {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      warehouseId
    };

    const analytics = await warehouseService.getWarehouseAnalytics(tenantId, options);
    res.json({ success: true, data: analytics });
  } catch (err) {
    next(err);
  }
}

async function getWarehousePerformanceMetrics(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const { period = 30 } = req.query;

    const options = { period: parseInt(period) };
    const metrics = await warehouseService.getWarehousePerformanceMetrics(id, tenantId, options);
    res.json({ success: true, data: metrics });
  } catch (err) {
    next(err);
  }
}

async function getWarehouseCapacityAnalysis(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { warehouseId } = req.query;

    const options = { warehouseId };
    const analysis = await warehouseService.getWarehouseCapacityAnalysis(tenantId, options);
    res.json({ success: true, data: analysis });
  } catch (err) {
    next(err);
  }
}

async function optimizeWarehouseInventory(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { 
      warehouseId, 
      optimizationType = 'BALANCE',
      targetUtilization = 70,
      excludeItems = []
    } = req.body;

    const options = {
      warehouseId,
      optimizationType,
      targetUtilization: parseInt(targetUtilization),
      excludeItems
    };

    const optimization = await warehouseService.optimizeWarehouseInventory(tenantId, options);
    res.json({ success: true, data: optimization });
  } catch (err) {
    next(err);
  }
}

async function getWarehouseMovementAnalytics(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { 
      warehouseId,
      startDate, 
      endDate, 
      groupBy = 'day' 
    } = req.query;

    const options = {
      warehouseId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      groupBy
    };

    const analytics = await warehouseService.getWarehouseMovementAnalytics(tenantId, options);
    res.json({ success: true, data: analytics });
  } catch (err) {
    next(err);
  }
}

async function getWarehouseCostAnalysis(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { 
      warehouseId,
      startDate, 
      endDate 
    } = req.query;

    const options = {
      warehouseId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined
    };

    const analysis = await warehouseService.getWarehouseCostAnalysis(tenantId, options);
    res.json({ success: true, data: analysis });
  } catch (err) {
    next(err);
  }
}

// Advanced warehouse analytics controller functions
async function analyzeWarehouseEfficiency(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const { period = 30 } = req.query;

    const analysis = await warehouseAnalyticsService.analyzeWarehouseEfficiency(
      id, 
      tenantId, 
      parseInt(period)
    );
    res.json({ success: true, data: analysis });
  } catch (err) {
    next(err);
  }
}

async function identifyWarehouseBottlenecks(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { 
      warehouseId,
      period = 30 
    } = req.query;

    const options = {
      warehouseId,
      period: parseInt(period)
    };

    const bottlenecks = await warehouseAnalyticsService.identifyWarehouseBottlenecks(tenantId, options);
    res.json({ success: true, data: bottlenecks });
  } catch (err) {
    next(err);
  }
}

async function analyzeWarehouseCostEfficiency(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { 
      warehouseId,
      startDate, 
      endDate 
    } = req.query;

    const options = {
      warehouseId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined
    };

    const analysis = await warehouseAnalyticsService.analyzeWarehouseCostEfficiency(tenantId, options);
    res.json({ success: true, data: analysis });
  } catch (err) {
    next(err);
  }
}

async function generateWarehouseOptimizationRecommendations(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { 
      warehouseId,
      optimizationGoals = ['EFFICIENCY', 'COST_REDUCTION', 'SPACE_UTILIZATION'],
      priority = 'HIGH'
    } = req.body;

    const options = {
      warehouseId,
      optimizationGoals,
      priority
    };

    const recommendations = await warehouseAnalyticsService.generateWarehouseOptimizationRecommendations(tenantId, options);
    res.json({ success: true, data: recommendations });
  } catch (err) {
    next(err);
  }
}

async function analyzeWarehousePerformanceTrends(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { 
      warehouseId,
      period = 90,
      groupBy = 'week'
    } = req.query;

    const options = {
      warehouseId,
      period: parseInt(period),
      groupBy
    };

    const trends = await warehouseAnalyticsService.analyzeWarehousePerformanceTrends(tenantId, options);
    res.json({ success: true, data: trends });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createWarehouse,
  getWarehouses,
  getWarehouseById,
  updateWarehouse,
  deleteWarehouse,
  getWarehouseStock,
  getWarehouseTransactions,
  transferStock,
  adjustStock,
  getWarehouseAnalytics,
  getWarehousePerformanceMetrics,
  getWarehouseCapacityAnalysis,
  optimizeWarehouseInventory,
  getWarehouseMovementAnalytics,
  getWarehouseCostAnalysis,
  analyzeWarehouseEfficiency,
  identifyWarehouseBottlenecks,
  analyzeWarehouseCostEfficiency,
  generateWarehouseOptimizationRecommendations,
  analyzeWarehousePerformanceTrends
};
