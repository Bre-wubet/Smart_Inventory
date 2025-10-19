const purchaseService = require('./purchase.service');
const purchaseAnalyticsService = require('./purchase-analytics.service');
const purchaseApprovalService = require('./purchase-approval.service');
const purchaseOptimizationService = require('./purchase-optimization.service');
const purchaseIntegrationService = require('./purchase-integration.service');
const { ValidationError, NotFoundError } = require('../../core/exceptions');
const { PAGINATION } = require('../../core/constants');

async function createPurchaseOrder(req, res, next) {
  try {
    const { supplierId, items, expectedAt, reference } = req.body;
    const tenantId = req.tenantId;

    if (!supplierId || !items || !Array.isArray(items) || items.length === 0) {
      throw new ValidationError('supplierId and items are required');
    }

    const purchaseOrder = await purchaseService.createPurchaseOrder({
      supplierId,
      items,
      expectedAt: expectedAt ? new Date(expectedAt) : null,
      reference,
      tenantId
    });

    res.status(201).json({ success: true, data: purchaseOrder });
  } catch (err) {
    next(err);
  }
}

async function getPurchaseOrders(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
    const search = req.query.search;
    const supplierId = req.query.supplierId;
    const status = req.query.status;

    const result = await purchaseService.getPurchaseOrders({
      tenantId,
      page,
      limit,
      search,
      supplierId,
      status
    });

    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function getPurchaseOrderById(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const purchaseOrder = await purchaseService.getPurchaseOrderById(id, tenantId);
    if (!purchaseOrder) {
      throw new NotFoundError('Purchase order not found');
    }

    res.json({ success: true, data: purchaseOrder });
  } catch (err) {
    next(err);
  }
}

async function updatePurchaseOrder(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const updateData = req.body;

    const purchaseOrder = await purchaseService.updatePurchaseOrder(id, tenantId, updateData);
    if (!purchaseOrder) {
      throw new NotFoundError('Purchase order not found');
    }

    res.json({ success: true, data: purchaseOrder });
  } catch (err) {
    next(err);
  }
}

async function cancelPurchaseOrder(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const purchaseOrder = await purchaseService.cancelPurchaseOrder(id, tenantId);
    if (!purchaseOrder) {
      throw new NotFoundError('Purchase order not found');
    }

    res.json({ success: true, data: purchaseOrder });
  } catch (err) {
    next(err);
  }
}

async function receivePurchaseOrder(req, res, next) {
  try {
    const { id } = req.params;
    const { receivedItems } = req.body;
    const createdById = req.user.id;

    if (!receivedItems || !Array.isArray(receivedItems) || receivedItems.length === 0) {
      throw new ValidationError('receivedItems array is required');
    }

    const result = await purchaseService.receivePurchaseOrder(id, receivedItems, createdById);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getPurchaseOrderItems(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const items = await purchaseService.getPurchaseOrderItems(id, tenantId);
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
}

async function generatePurchaseOrder(req, res, next) {
  try {
    const { items, supplierId, warehouseId } = req.body;
    const tenantId = req.tenantId;

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new ValidationError('items array is required');
    }

    const purchaseOrder = await purchaseService.generatePurchaseOrder({
      items,
      supplierId,
      warehouseId,
      tenantId
    });

    res.status(201).json({ success: true, data: purchaseOrder });
  } catch (err) {
    next(err);
  }
}

// ===== ANALYTICS CONTROLLERS =====

async function getPurchaseDashboard(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { period = 30, supplierId, warehouseId } = req.query;

    const dashboard = await purchaseAnalyticsService.getPurchaseDashboard(tenantId, {
      period: parseInt(period),
      supplierId,
      warehouseId
    });

    res.json({ success: true, data: dashboard });
  } catch (err) {
    next(err);
  }
}

async function getPurchasePerformance(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { period = 90, supplierId } = req.query;

    const performance = await purchaseAnalyticsService.getPurchasePerformance(tenantId, {
      period: parseInt(period),
      supplierId
    });

    res.json({ success: true, data: performance });
  } catch (err) {
    next(err);
  }
}

async function getPurchaseCostAnalysis(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { period = 365, itemId, supplierId, itemType } = req.query;

    const costAnalysis = await purchaseAnalyticsService.getPurchaseCostAnalysis(tenantId, {
      period: parseInt(period),
      itemId,
      supplierId,
      itemType
    });

    res.json({ success: true, data: costAnalysis });
  } catch (err) {
    next(err);
  }
}

async function getPurchaseForecasting(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { period = 90, forecastPeriod = 30 } = req.query;

    const forecasting = await purchaseAnalyticsService.getPurchaseForecasting(tenantId, {
      period: parseInt(period),
      forecastPeriod: parseInt(forecastPeriod)
    });

    res.json({ success: true, data: forecasting });
  } catch (err) {
    next(err);
  }
}

// ===== APPROVAL WORKFLOW CONTROLLERS =====

async function createApprovalWorkflow(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const { approvers, approvalType, requiredApprovals } = req.body;

    if (!approvers || !Array.isArray(approvers) || approvers.length === 0) {
      throw new ValidationError('Approvers array is required');
    }

    const workflow = await purchaseApprovalService.createApprovalWorkflow(id, tenantId, {
      approvers,
      approvalType,
      requiredApprovals
    });

    res.status(201).json({ success: true, data: workflow });
  } catch (err) {
    next(err);
  }
}

async function approveStep(req, res, next) {
  try {
    const { stepId } = req.params;
    const userId = req.user.id;
    const { comments, conditions } = req.body;

    const result = await purchaseApprovalService.approveStep(stepId, userId, {
      comments,
      conditions
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function rejectStep(req, res, next) {
  try {
    const { stepId } = req.params;
    const userId = req.user.id;
    const { comments, reason } = req.body;

    const result = await purchaseApprovalService.rejectStep(stepId, userId, {
      comments,
      reason
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getWorkflowStatus(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const status = await purchaseApprovalService.getWorkflowStatus(id, tenantId);
    if (!status) {
      throw new NotFoundError('Approval workflow not found');
    }

    res.json({ success: true, data: status });
  } catch (err) {
    next(err);
  }
}

async function getUserPendingApprovals(req, res, next) {
  try {
    const userId = req.user.id;
    const tenantId = req.tenantId;

    const pendingApprovals = await purchaseApprovalService.getUserPendingApprovals(userId, tenantId);

    res.json({ success: true, data: pendingApprovals });
  } catch (err) {
    next(err);
  }
}

async function getApprovalHistory(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const history = await purchaseApprovalService.getApprovalHistory(id, tenantId);
    if (!history) {
      throw new NotFoundError('Approval history not found');
    }

    res.json({ success: true, data: history });
  } catch (err) {
    next(err);
  }
}

// ===== OPTIMIZATION CONTROLLERS =====

async function getPurchaseOptimization(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { period = 90, focusArea = 'ALL' } = req.query;

    const optimization = await purchaseOptimizationService.getPurchaseOptimization(tenantId, {
      period: parseInt(period),
      focusArea
    });

    res.json({ success: true, data: optimization });
  } catch (err) {
    next(err);
  }
}

async function getPOOptimizationSuggestions(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const suggestions = await purchaseOptimizationService.getPOOptimizationSuggestions(id, tenantId);

    res.json({ success: true, data: suggestions });
  } catch (err) {
    next(err);
  }
}

// ===== SUPPLIER INTEGRATION CONTROLLERS =====

async function getSupplierPerformanceAnalysis(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { period = 90, supplierId } = req.query;

    const analysis = await purchaseIntegrationService.getSupplierPerformanceAnalysis(tenantId, {
      period: parseInt(period),
      supplierId
    });

    res.json({ success: true, data: analysis });
  } catch (err) {
    next(err);
  }
}

async function getSupplierCostComparison(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { itemId, itemType, period = 90 } = req.query;

    const comparison = await purchaseIntegrationService.getSupplierCostComparison(tenantId, {
      itemId,
      itemType,
      period: parseInt(period)
    });

    res.json({ success: true, data: comparison });
  } catch (err) {
    next(err);
  }
}

async function getSupplierRiskAssessment(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { period = 180 } = req.query;

    const assessment = await purchaseIntegrationService.getSupplierRiskAssessment(tenantId, {
      period: parseInt(period)
    });

    res.json({ success: true, data: assessment });
  } catch (err) {
    next(err);
  }
}

async function getSupplierCollaborationOpportunities(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { period = 90 } = req.query;

    const opportunities = await purchaseIntegrationService.getSupplierCollaborationOpportunities(tenantId, {
      period: parseInt(period)
    });

    res.json({ success: true, data: opportunities });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  // Original purchase order endpoints
  createPurchaseOrder,
  getPurchaseOrders,
  getPurchaseOrderById,
  updatePurchaseOrder,
  cancelPurchaseOrder,
  receivePurchaseOrder,
  getPurchaseOrderItems,
  generatePurchaseOrder,

  // Analytics endpoints
  getPurchaseDashboard,
  getPurchasePerformance,
  getPurchaseCostAnalysis,
  getPurchaseForecasting,

  // Approval workflow endpoints
  createApprovalWorkflow,
  approveStep,
  rejectStep,
  getWorkflowStatus,
  getUserPendingApprovals,
  getApprovalHistory,

  // Optimization endpoints
  getPurchaseOptimization,
  getPOOptimizationSuggestions,

  // Supplier integration endpoints
  getSupplierPerformanceAnalysis,
  getSupplierCostComparison,
  getSupplierRiskAssessment,
  getSupplierCollaborationOpportunities
};
