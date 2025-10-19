const { Router } = require('express');
const tenantController = require('./tenant.controller');
const { authenticateToken, requireTenantAccess, requireRole } = require('../../core/middlewares/auth');

const router = Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Current tenant routes (accessible by all authenticated users)
router.get('/current', requireTenantAccess, tenantController.getCurrentTenant);
router.get('/current/settings', requireTenantAccess, tenantController.getCurrentTenantSettings);
router.put('/current/settings', requireTenantAccess, tenantController.updateCurrentTenantSettings);
router.get('/current/usage', requireTenantAccess, tenantController.getCurrentTenantUsage);
router.get('/current/analytics', requireTenantAccess, tenantController.getCurrentTenantAnalytics);

// Admin-only tenant management routes
router.get('/', requireRole(['ADMIN']), tenantController.getTenants);
router.get('/:id', requireRole(['ADMIN']), tenantController.getTenantById);
router.post('/', requireRole(['ADMIN']), tenantController.createTenant);
router.put('/:id', requireRole(['ADMIN']), tenantController.updateTenant);
router.delete('/:id', requireRole(['ADMIN']), tenantController.deleteTenant);

// Admin-only tenant analytics and management
router.get('/:id/analytics', requireRole(['ADMIN']), tenantController.getTenantAnalytics);
router.get('/:id/settings', requireRole(['ADMIN']), tenantController.getTenantSettings);
router.put('/:id/settings', requireRole(['ADMIN']), tenantController.updateTenantSettings);
router.get('/:id/usage', requireRole(['ADMIN']), tenantController.getTenantUsage);
router.get('/:id/billing', requireRole(['ADMIN']), tenantController.getTenantBilling);

module.exports = router;
