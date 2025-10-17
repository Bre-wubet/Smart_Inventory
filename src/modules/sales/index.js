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

module.exports = router;


