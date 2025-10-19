// src/modules/customer/index.js
const { Router } = require('express');
const { authenticateToken, requireTenantAccess } = require('../../core/middlewares/auth');
const customerController = require('./customer.controller');

const router = Router();

// Apply authentication and tenant access to all routes
router.use(authenticateToken);
router.use(requireTenantAccess);

// Basic customer CRUD routes
router.post('/customers', customerController.createCustomer);
router.get('/customers', customerController.getCustomers);
router.get('/customers/:id', customerController.getCustomerById);
router.put('/customers/:id', customerController.updateCustomer);
router.delete('/customers/:id', customerController.deleteCustomer);

// Customer analytics and management routes
router.get('/customers/analytics', customerController.getCustomerAnalytics);
router.get('/customers/top', customerController.getTopCustomers);
router.get('/customers/segments', customerController.segmentCustomers);
router.get('/customers/:id/metrics', customerController.getCustomerMetrics);
router.get('/customers/:id/performance-history', customerController.getCustomerPerformanceHistory);

module.exports = router;
