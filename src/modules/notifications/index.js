const { Router } = require('express');
const notificationsController = require('./notifications.controller');
const { authenticateToken, requireTenantAccess } = require('../../core/middlewares/auth');

const router = Router();

// Apply authentication and tenant access to all routes
router.use(authenticateToken);
router.use(requireTenantAccess);

// General alert management
router.get('/', notificationsController.getAlerts);
router.get('/:id', notificationsController.getAlertById);
router.patch('/:id/read', notificationsController.markAlertAsRead);
router.patch('/read-all', notificationsController.markAllAlertsAsRead);
router.delete('/:id', notificationsController.deleteAlert);

// Alert settings
router.get('/settings', notificationsController.getAlertSettings);
router.put('/settings', notificationsController.updateAlertSettings);

// Custom alerts
router.post('/custom', notificationsController.createCustomAlert);

// Specific alert types
router.get('/low-stock', notificationsController.getLowStockAlerts);
router.get('/expiry', notificationsController.getExpiryAlerts);
router.get('/reorder-point', notificationsController.getReorderPointAlerts);
router.get('/overstock', notificationsController.getOverstockAlerts);
router.get('/purchase-orders', notificationsController.getPurchaseOrderAlerts);
router.get('/sales-orders', notificationsController.getSalesOrderAlerts);

// Reports
router.post('/reports', notificationsController.generateAlertReport);

module.exports = router;
