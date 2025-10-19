const itemService = require('./item.service');
const stockService = require('./stock.service');
const warehouseService = require('./warehouse.service');
const alertService = require('./alert.service');
const batchService = require('./batch.service');
const analyticsService = require('./analytics.service');
const { ValidationError, NotFoundError } = require('../../core/exceptions');
const { PAGINATION } = require('../../core/constants');

async function createItem(req, res, next) {
  try {
    const { sku, name, description, unit, type, cost, price } = req.body;
    const tenantId = req.tenantId;

    if (!sku || !name || !unit) {
      throw new ValidationError('SKU, name, and unit are required');
    }

    const item = await itemService.createItem({
      sku,
      name,
      description,
      unit,
      type,
      cost: parseFloat(cost || 0),
      price: parseFloat(price || 0),
      tenantId
    });

    res.status(201).json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
}
async function getItems(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
    const search = req.query.search;
    const type = req.query.type;
    const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;

    const result = await itemService.getItems({
      tenantId,
      page,
      limit,
      search,
      type,
      isActive
    });

    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function getItemById(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const item = await itemService.getItemById(id, tenantId);
    if (!item) {
      throw new NotFoundError('Item not found');
    }

    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
}

async function updateItem(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const updateData = req.body;

    const item = await itemService.updateItem(id, tenantId, updateData);
    if (!item) {
      throw new NotFoundError('Item not found');
    }

    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
}

async function deleteItem(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const deleted = await itemService.deleteItem(id, tenantId);
    if (!deleted) {
      throw new NotFoundError('Item not found');
    }

    res.json({ success: true, message: 'Item deleted successfully' });
  } catch (err) {
    next(err);
  }
}

async function getItemStock(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const stock = await itemService.getItemStock(id, tenantId);
    res.json({ success: true, data: stock });
  } catch (err) {
    next(err);
  }
}

async function getItemTransactions(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);

    const result = await itemService.getItemTransactions(id, tenantId, { page, limit });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

// ===== STOCK MANAGEMENT ENDPOINTS =====

async function getStockOverview(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const filters = {
      warehouseId: req.query.warehouseId,
      itemType: req.query.itemType,
      lowStockOnly: req.query.lowStockOnly === 'true',
      overstockOnly: req.query.overstockOnly === 'true'
    };

    const result = await stockService.getStockOverview(tenantId, filters);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function transferStock(req, res, next) {
  try {
    const {
      itemId,
      fromWarehouseId,
      toWarehouseId,
      quantity,
      reference,
      note
    } = req.body;
    const createdById = req.userId;

    const result = await stockService.transferStock({
      itemId,
      fromWarehouseId,
      toWarehouseId,
      quantity,
      reference,
      createdById,
      note
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function reserveStock(req, res, next) {
  try {
    const {
      itemId,
      warehouseId,
      quantity,
      reference,
      note
    } = req.body;
    const createdById = req.userId;

    const result = await stockService.reserveStock({
      itemId,
      warehouseId,
      quantity,
      reference,
      createdById,
      note
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function releaseStock(req, res, next) {
  try {
    const {
      itemId,
      warehouseId,
      quantity,
      reference,
      note
    } = req.body;
    const createdById = req.userId;

    const result = await stockService.releaseStock({
      itemId,
      warehouseId,
      quantity,
      reference,
      createdById,
      note
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function adjustStock(req, res, next) {
  try {
    const {
      itemId,
      warehouseId,
      quantity,
      adjustmentType,
      reference,
      note
    } = req.body;
    const createdById = req.userId;

    const result = await stockService.adjustStock({
      itemId,
      warehouseId,
      quantity,
      adjustmentType,
      reference,
      createdById,
      note
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getStockMovements(req, res, next) {
  try {
    const filters = {
      itemId: req.query.itemId,
      warehouseId: req.query.warehouseId,
      movementType: req.query.movementType,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      page: parseInt(req.query.page) || 1,
      limit: Math.min(parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT)
    };

    const result = await stockService.getStockMovements(filters);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function getStockAnalytics(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const options = {
      period: parseInt(req.query.period) || 30,
      warehouseId: req.query.warehouseId
    };

    const result = await stockService.getStockAnalytics(id, tenantId, options);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ===== WAREHOUSE OPERATIONS ENDPOINTS =====

async function getWarehouseInventory(req, res, next) {
  try {
    const { warehouseId } = req.params;
    const tenantId = req.tenantId;
    const filters = {
      itemType: req.query.itemType,
      lowStockOnly: req.query.lowStockOnly === 'true',
      includeInactive: req.query.includeInactive === 'true'
    };

    const result = await warehouseService.getWarehouseInventory(warehouseId, tenantId, filters);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function getWarehouseCapacityUtilization(req, res, next) {
  try {
    const { warehouseId } = req.params;
    const tenantId = req.tenantId;

    const result = await warehouseService.getWarehouseCapacityUtilization(warehouseId, tenantId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getWarehouseMovements(req, res, next) {
  try {
    const { warehouseId } = req.params;
    const tenantId = req.tenantId;
    const filters = {
      movementType: req.query.movementType,
      itemType: req.query.itemType,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      page: parseInt(req.query.page) || 1,
      limit: Math.min(parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT)
    };

    const result = await warehouseService.getWarehouseMovements(warehouseId, tenantId, filters);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function bulkStockAdjustment(req, res, next) {
  try {
    const { warehouseId } = req.params;
    const { adjustments } = req.body;
    const tenantId = req.tenantId;
    const createdById = req.userId;

    const result = await warehouseService.bulkStockAdjustment(warehouseId, tenantId, adjustments, createdById);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getWarehousePerformance(req, res, next) {
  try {
    const { warehouseId } = req.params;
    const tenantId = req.tenantId;
    const options = {
      period: parseInt(req.query.period) || 30
    };

    const result = await warehouseService.getWarehousePerformance(warehouseId, tenantId, options);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ===== ALERT MANAGEMENT ENDPOINTS =====

async function generateStockAlerts(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const options = {
      warehouseId: req.query.warehouseId,
      itemType: req.query.itemType,
      forceRegenerate: req.query.forceRegenerate === 'true',
      alertTypes: req.query.alertTypes ? req.query.alertTypes.split(',') : ['LOW_STOCK', 'OVERSTOCK', 'REORDER']
    };

    const result = await alertService.generateStockAlerts(tenantId, options);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function getActiveAlerts(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const filters = {
      alertType: req.query.alertType,
      warehouseId: req.query.warehouseId,
      itemId: req.query.itemId,
      page: parseInt(req.query.page) || 1,
      limit: Math.min(parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT),
      sortBy: req.query.sortBy || 'createdAt',
      sortOrder: req.query.sortOrder || 'desc'
    };

    const result = await alertService.getActiveAlerts(tenantId, filters);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function resolveAlert(req, res, next) {
  try {
    const { alertId } = req.params;
    const tenantId = req.tenantId;
    const { resolutionNote } = req.body;
    const resolvedBy = req.userId;

    const result = await alertService.resolveAlert(alertId, tenantId, resolvedBy, resolutionNote);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function bulkResolveAlerts(req, res, next) {
  try {
    const { alertIds } = req.body;
    const tenantId = req.tenantId;
    const { resolutionNote } = req.body;
    const resolvedBy = req.userId;

    const result = await alertService.bulkResolveAlerts(alertIds, tenantId, resolvedBy, resolutionNote);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getAlertStatistics(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const options = {
      period: parseInt(req.query.period) || 30,
      warehouseId: req.query.warehouseId
    };

    const result = await alertService.getAlertStatistics(tenantId, options);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getItemAlerts(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const filters = {
      includeResolved: req.query.includeResolved === 'true',
      alertType: req.query.alertType,
      warehouseId: req.query.warehouseId
    };

    const result = await alertService.getItemAlerts(id, tenantId, filters);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ===== BATCH TRACKING ENDPOINTS =====

async function createProductionBatch(req, res, next) {
  try {
    const {
      recipeId,
      quantity,
      batchRef,
      notes
    } = req.body;
    const tenantId = req.tenantId;
    const createdById = req.userId;

    const result = await batchService.createProductionBatch({
      recipeId,
      quantity,
      batchRef,
      notes,
      tenantId,
      createdById
    });

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function startProductionBatch(req, res, next) {
  try {
    const { batchId } = req.params;
    const tenantId = req.tenantId;
    const startedById = req.userId;

    const result = await batchService.startProductionBatch(batchId, tenantId, startedById);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function completeProductionBatch(req, res, next) {
  try {
    const { batchId } = req.params;
    const {
      actualQuantity,
      warehouseId,
      notes
    } = req.body;
    const tenantId = req.tenantId;
    const completedById = req.userId;

    const result = await batchService.completeProductionBatch(batchId, tenantId, {
      actualQuantity,
      warehouseId,
      completedById,
      notes
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getBatchTraceability(req, res, next) {
  try {
    const { batchId } = req.params;
    const tenantId = req.tenantId;

    const result = await batchService.getBatchTraceability(batchId, tenantId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getProductBatchHistory(req, res, next) {
  try {
    const { productId } = req.params;
    const tenantId = req.tenantId;
    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      status: req.query.status,
      page: parseInt(req.query.page) || 1,
      limit: Math.min(parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT)
    };

    const result = await batchService.getProductBatchHistory(productId, tenantId, filters);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function getIngredientTraceability(req, res, next) {
  try {
    const { itemId } = req.params;
    const tenantId = req.tenantId;
    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      batchStatus: req.query.batchStatus,
      page: parseInt(req.query.page) || 1,
      limit: Math.min(parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT)
    };

    const result = await batchService.getIngredientTraceability(itemId, tenantId, filters);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function cancelProductionBatch(req, res, next) {
  try {
    const { batchId } = req.params;
    const { reason } = req.body;
    const tenantId = req.tenantId;
    const cancelledById = req.userId;

    const result = await batchService.cancelProductionBatch(batchId, tenantId, cancelledById, reason);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ===== ANALYTICS ENDPOINTS =====

async function getInventoryDashboard(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const options = {
      period: parseInt(req.query.period) || 30,
      warehouseId: req.query.warehouseId
    };

    const result = await analyticsService.getInventoryDashboard(tenantId, options);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getInventoryValuation(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const options = {
      warehouseId: req.query.warehouseId,
      itemType: req.query.itemType,
      valuationMethod: req.query.valuationMethod || 'WEIGHTED_AVERAGE',
      asOfDate: req.query.asOfDate ? new Date(req.query.asOfDate) : new Date()
    };

    const result = await analyticsService.getInventoryValuation(tenantId, options);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getStockTurnoverAnalysis(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const options = {
      period: parseInt(req.query.period) || 365,
      warehouseId: req.query.warehouseId,
      itemType: req.query.itemType
    };

    const result = await analyticsService.getStockTurnoverAnalysis(tenantId, options);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getInventoryAging(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const options = {
      warehouseId: req.query.warehouseId,
      itemType: req.query.itemType
    };

    const result = await analyticsService.getInventoryAging(tenantId, options);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getInventoryPerformance(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const options = {
      period: parseInt(req.query.period) || 30,
      warehouseId: req.query.warehouseId
    };

    const result = await analyticsService.getInventoryPerformance(tenantId, options);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  // Original item endpoints
  createItem,
  getItems,
  getItemById,
  updateItem,
  deleteItem,
  getItemStock,
  getItemTransactions,
  
  // Stock management endpoints
  getStockOverview,
  transferStock,
  reserveStock,
  releaseStock,
  adjustStock,
  getStockMovements,
  getStockAnalytics,
  
  // Warehouse operations endpoints
  getWarehouseInventory,
  getWarehouseCapacityUtilization,
  getWarehouseMovements,
  bulkStockAdjustment,
  getWarehousePerformance,
  
  // Alert management endpoints
  generateStockAlerts,
  getActiveAlerts,
  resolveAlert,
  bulkResolveAlerts,
  getAlertStatistics,
  getItemAlerts,
  
  // Batch tracking endpoints
  createProductionBatch,
  startProductionBatch,
  completeProductionBatch,
  getBatchTraceability,
  getProductBatchHistory,
  getIngredientTraceability,
  cancelProductionBatch,
  
  // Analytics endpoints
  getInventoryDashboard,
  getInventoryValuation,
  getStockTurnoverAnalysis,
  getInventoryAging,
  getInventoryPerformance
};
