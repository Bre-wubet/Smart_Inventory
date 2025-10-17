const { Router } = require('express');
const costingController = require('./costing.controller');
const { authenticateToken, requireTenantAccess } = require('../../core/middlewares/auth');

const router = Router();

// Apply authentication and tenant access to all routes
router.use(authenticateToken);
router.use(requireTenantAccess);

// Costing analysis routes
router.get('/inventory-valuation', costingController.getInventoryValuation);
router.get('/cost-analysis', costingController.getCostAnalysis);
router.get('/profit-analysis', costingController.getProfitAnalysis);
router.get('/cost-trends', costingController.getCostTrends);
router.get('/margin-analysis', costingController.getMarginAnalysis);

// Recipe and production cost analysis
router.get('/recipe/:id/cost-analysis', costingController.getRecipeCostAnalysis);
router.get('/production-batch/:id/cost-analysis', costingController.getProductionCostAnalysis);

// Supplier cost comparison
router.get('/supplier-comparison/:id', costingController.getSupplierCostComparison);

// Report generation
router.post('/reports', costingController.generateCostReport);

module.exports = router;
