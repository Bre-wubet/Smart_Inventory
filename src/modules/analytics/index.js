const { Router } = require('express');
const analyticsController = require('./analytics.controller');
const { authenticateToken, requireTenantAccess, requireRole } = require('../../core/middlewares/auth');

const router = Router();

// Apply authentication and tenant access to all routes
router.use(authenticateToken);
router.use(requireTenantAccess);

// Dashboard metrics (accessible to all authenticated users)
router.get('/dashboard', analyticsController.getDashboardMetrics);

// Analytics routes (require MANAGER or ADMIN role)
router.get('/inventory', requireRole(['MANAGER', 'ADMIN']), analyticsController.getInventoryAnalytics);
router.get('/sales', requireRole(['MANAGER', 'ADMIN']), analyticsController.getSalesAnalytics);
router.get('/purchases', requireRole(['MANAGER', 'ADMIN']), analyticsController.getPurchaseAnalytics);
router.get('/stock-movements', requireRole(['MANAGER', 'ADMIN']), analyticsController.getStockMovementAnalytics);
router.get('/warehouse', requireRole(['MANAGER', 'ADMIN']), analyticsController.getWarehouseAnalytics);

// Performance analytics
router.get('/top-selling-items', requireRole(['MANAGER', 'ADMIN']), analyticsController.getTopSellingItems);
router.get('/slow-moving-items', requireRole(['MANAGER', 'ADMIN']), analyticsController.getSlowMovingItems);
router.get('/supplier-performance', requireRole(['MANAGER', 'ADMIN']), analyticsController.getSupplierPerformance);
router.get('/customer-analytics', requireRole(['MANAGER', 'ADMIN']), analyticsController.getCustomerAnalytics);

// Financial analytics
router.get('/profit-loss', requireRole(['MANAGER', 'ADMIN']), analyticsController.getProfitLossAnalysis);
router.get('/trends', requireRole(['MANAGER', 'ADMIN']), analyticsController.getTrendAnalysis);

// Report generation
router.post('/reports', requireRole(['MANAGER', 'ADMIN']), analyticsController.generateCustomReport);

// Analytics logging (accessible to all authenticated users)
router.get('/logs', analyticsController.getAnalyticsLogs);
router.post('/logs', analyticsController.logAnalyticsEvent);

module.exports = router;
