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

// Enhanced warehouse analytics and management routes
router.get('/warehouses/analytics', warehouseController.getWarehouseAnalytics);
router.get('/warehouses/:id/performance', warehouseController.getWarehousePerformanceMetrics);
router.get('/warehouses/capacity-analysis', warehouseController.getWarehouseCapacityAnalysis);
router.post('/warehouses/optimize', warehouseController.optimizeWarehouseInventory);
router.get('/warehouses/movement-analytics', warehouseController.getWarehouseMovementAnalytics);
router.get('/warehouses/cost-analysis', warehouseController.getWarehouseCostAnalysis);

// Advanced warehouse analytics routes
router.get('/warehouses/:id/efficiency', warehouseController.analyzeWarehouseEfficiency);
router.get('/warehouses/bottlenecks', warehouseController.identifyWarehouseBottlenecks);
router.get('/warehouses/cost-efficiency', warehouseController.analyzeWarehouseCostEfficiency);
router.post('/warehouses/optimization-recommendations', warehouseController.generateWarehouseOptimizationRecommendations);
router.get('/warehouses/performance-trends', warehouseController.analyzeWarehousePerformanceTrends);

module.exports = router;


