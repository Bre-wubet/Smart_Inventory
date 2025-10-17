const { Router } = require('express');
const { authenticateToken, requireTenantAccess } = require('../../core/middlewares/auth');
const purchaseController = require('./purchase.controller');

const router = Router();

// Apply authentication and tenant access to all routes
router.use(authenticateToken);
router.use(requireTenantAccess);

// Purchase order routes
router.post('/purchase-orders', purchaseController.createPurchaseOrder);
router.get('/purchase-orders', purchaseController.getPurchaseOrders);
router.get('/purchase-orders/:id', purchaseController.getPurchaseOrderById);
router.put('/purchase-orders/:id', purchaseController.updatePurchaseOrder);
router.delete('/purchase-orders/:id/cancel', purchaseController.cancelPurchaseOrder);

// Purchase order operations
router.post('/purchase-orders/:id/receive', purchaseController.receivePurchaseOrder);
router.get('/purchase-orders/:id/items', purchaseController.getPurchaseOrderItems);
router.post('/purchase-orders/generate', purchaseController.generatePurchaseOrder);

module.exports = router;


