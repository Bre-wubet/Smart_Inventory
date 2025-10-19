const { Router } = require('express');
const { authenticateToken, requireTenantAccess } = require('../../core/middlewares/auth');
const salesController = require('./sales.controller');

const router = Router();

// Apply authentication and tenant access to all routes
router.use(authenticateToken);
router.use(requireTenantAccess);

// Sale order routes
router.post('/sale-orders', salesController.createSaleOrder);
router.get('/sale-orders', salesController.getSaleOrders);
router.get('/sale-orders/:id', salesController.getSaleOrderById);
router.put('/sale-orders/:id', salesController.updateSaleOrder);
router.delete('/sale-orders/:id/cancel', salesController.cancelSaleOrder);

// Sale order operations
router.post('/sale-orders/:id/fulfill', salesController.fulfillSaleOrder);
router.get('/sale-orders/:id/items', salesController.getSaleOrderItems);

// Enhanced sales analytics and management routes
router.get('/sales/analytics', salesController.getSalesAnalytics);
router.get('/sales/performance', salesController.getSalesPerformanceMetrics);
router.get('/sales/top-items', salesController.getTopSellingItems);
router.get('/sales/forecast', salesController.getSalesForecast);
router.get('/sales/optimization-recommendations', salesController.getSalesOptimizationRecommendations);

// Advanced sales analytics routes
router.get('/sales/trends', salesController.getSalesTrendsAnalysis);
router.get('/sales/customer-behavior', salesController.getCustomerBehaviorAnalysis);
router.get('/sales/product-performance', salesController.getProductPerformanceAnalysis);
router.get('/sales/insights', salesController.getSalesInsights);

module.exports = router;


