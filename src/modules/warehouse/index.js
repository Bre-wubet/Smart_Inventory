const { Router } = require('express');
const { authenticateToken, requireTenantAccess } = require('../../core/middlewares/auth');
const warehouseController = require('./warehouse.controller');

const router = Router();

// Apply authentication and tenant access to all routes
router.use(authenticateToken);
router.use(requireTenantAccess);

// Warehouse routes
router.post('/warehouses', warehouseController.createWarehouse);
router.get('/warehouses', warehouseController.getWarehouses);
router.get('/warehouses/:id', warehouseController.getWarehouseById);
router.put('/warehouses/:id', warehouseController.updateWarehouse);
router.delete('/warehouses/:id', warehouseController.deleteWarehouse);

// Stock management routes
router.get('/warehouses/:id/stock', warehouseController.getWarehouseStock);
router.get('/warehouses/:id/transactions', warehouseController.getWarehouseTransactions);
router.post('/transfer', warehouseController.transferStock);
router.post('/adjust', warehouseController.adjustStock);

module.exports = router;


