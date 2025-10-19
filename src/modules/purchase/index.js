const { Router } = require('express');
const { authenticateToken, requireTenantAccess } = require('../../core/middlewares/auth');
const purchaseController = require('./purchase.controller');

const router = Router();

// Apply authentication and tenant access to all routes
router.use(authenticateToken);
router.use(requireTenantAccess);

// ===== ORIGINAL PURCHASE ORDER ROUTES =====
router.post('/purchase-orders', purchaseController.createPurchaseOrder);
router.get('/purchase-orders', purchaseController.getPurchaseOrders);
router.get('/purchase-orders/:id', purchaseController.getPurchaseOrderById);
router.put('/purchase-orders/:id', purchaseController.updatePurchaseOrder);
router.delete('/purchase-orders/:id/cancel', purchaseController.cancelPurchaseOrder);

// ===== PURCHASE ORDER OPERATIONS ROUTES =====
router.post('/purchase-orders/:id/receive', purchaseController.receivePurchaseOrder);
router.get('/purchase-orders/:id/items', purchaseController.getPurchaseOrderItems);
router.post('/purchase-orders/generate', purchaseController.generatePurchaseOrder);

// ===== ANALYTICS ROUTES =====
router.get('/analytics/dashboard', purchaseController.getPurchaseDashboard);
router.get('/analytics/performance', purchaseController.getPurchasePerformance);
router.get('/analytics/cost-analysis', purchaseController.getPurchaseCostAnalysis);
router.get('/analytics/forecasting', purchaseController.getPurchaseForecasting);

// ===== APPROVAL WORKFLOW ROUTES =====
router.post('/purchase-orders/:id/approval-workflow', purchaseController.createApprovalWorkflow);
router.put('/approval-steps/:stepId/approve', purchaseController.approveStep);
router.put('/approval-steps/:stepId/reject', purchaseController.rejectStep);
router.get('/purchase-orders/:id/workflow-status', purchaseController.getWorkflowStatus);
router.get('/approvals/pending', purchaseController.getUserPendingApprovals);
router.get('/purchase-orders/:id/approval-history', purchaseController.getApprovalHistory);

// ===== OPTIMIZATION ROUTES =====
router.get('/optimization/recommendations', purchaseController.getPurchaseOptimization);
router.get('/purchase-orders/:id/optimization-suggestions', purchaseController.getPOOptimizationSuggestions);

// ===== SUPPLIER INTEGRATION ROUTES =====
router.get('/suppliers/performance-analysis', purchaseController.getSupplierPerformanceAnalysis);
router.get('/suppliers/cost-comparison', purchaseController.getSupplierCostComparison);
router.get('/suppliers/risk-assessment', purchaseController.getSupplierRiskAssessment);
router.get('/suppliers/collaboration-opportunities', purchaseController.getSupplierCollaborationOpportunities);

module.exports = router;


