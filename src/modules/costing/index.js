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

// Advanced Cost Analytics routes
router.get('/analytics/dashboard', costingController.getCostAnalyticsDashboard);
router.get('/analytics/optimization-recommendations', costingController.getCostOptimizationRecommendations);
router.get('/analytics/forecast', costingController.getCostForecast);
router.get('/analytics/benchmarking', costingController.getCostBenchmarking);

// Advanced Cost Analytics Service routes
router.get('/analytics/variance-analysis', costingController.getCostVarianceAnalysis);
router.get('/analytics/cost-center-analysis', costingController.getCostCenterAnalysis);
router.get('/analytics/cost-impact-analysis', costingController.getCostImpactAnalysis);
router.get('/analytics/optimization-opportunities', costingController.getCostOptimizationOpportunities);

module.exports = router;
