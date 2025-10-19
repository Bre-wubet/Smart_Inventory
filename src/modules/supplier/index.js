const { Router } = require('express');
const { authenticateToken, requireTenantAccess } = require('../../core/middlewares/auth');
const supplierController = require('./supplier.controller');

const router = Router();

// Apply authentication and tenant access to all routes
router.use(authenticateToken);
router.use(requireTenantAccess);

// Basic supplier CRUD routes
router.post('/suppliers', supplierController.createSupplier);
router.get('/suppliers', supplierController.getSuppliers);
router.get('/suppliers/:id', supplierController.getSupplierById);
router.put('/suppliers/:id', supplierController.updateSupplier);
router.delete('/suppliers/:id', supplierController.deleteSupplier);

// Supplier-item relationship routes
router.post('/suppliers/items', supplierController.addItemToSupplier);
router.put('/suppliers/items/:id', supplierController.updateItemSupplier);
router.delete('/suppliers/items/:id', supplierController.removeItemFromSupplier);
router.get('/suppliers/:id/items', supplierController.getSupplierItems);
router.get('/items/:itemId/suppliers', supplierController.getItemSuppliers);

// Enhanced supplier analytics and management routes
router.get('/suppliers/analytics', supplierController.getSupplierAnalytics);
router.get('/suppliers/top', supplierController.getTopSuppliers);
router.put('/suppliers/:id/rating', supplierController.updateSupplierRating);
router.get('/suppliers/:id/risk-assessment', supplierController.getSupplierRiskAssessment);
router.get('/suppliers/:id/performance-history', supplierController.getSupplierPerformanceHistory);
router.get('/suppliers/:id/metrics', supplierController.getSupplierMetrics);

module.exports = router;
