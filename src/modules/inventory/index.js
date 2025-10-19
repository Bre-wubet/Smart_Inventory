const { Router } = require('express');
const { authenticateToken, requireTenantAccess } = require('../../core/middlewares/auth');
const itemController = require('./item.controller');

const router = Router();

// Apply authentication and tenant access to all routes
router.use(authenticateToken);
router.use(requireTenantAccess);

// ===== ORIGINAL ITEM ROUTES =====
router.post('/items', itemController.createItem);
router.get('/items', itemController.getItems);
router.get('/items/:id', itemController.getItemById);
router.put('/items/:id', itemController.updateItem);
router.delete('/items/:id', itemController.deleteItem);
router.get('/items/:id/stock', itemController.getItemStock);
router.get('/items/:id/transactions', itemController.getItemTransactions);

// ===== STOCK MANAGEMENT ROUTES =====
router.get('/stock/overview', itemController.getStockOverview);
router.post('/stock/transfer', itemController.transferStock);
router.post('/stock/reserve', itemController.reserveStock);
router.post('/stock/release', itemController.releaseStock);
router.post('/stock/adjust', itemController.adjustStock);
router.get('/stock/movements', itemController.getStockMovements);
router.get('/stock/analytics/:id', itemController.getStockAnalytics);

// ===== WAREHOUSE OPERATIONS ROUTES =====
router.get('/warehouses/:warehouseId/inventory', itemController.getWarehouseInventory);
router.get('/warehouses/:warehouseId/capacity', itemController.getWarehouseCapacityUtilization);
router.get('/warehouses/:warehouseId/movements', itemController.getWarehouseMovements);
router.post('/warehouses/:warehouseId/bulk-adjust', itemController.bulkStockAdjustment);
router.get('/warehouses/:warehouseId/performance', itemController.getWarehousePerformance);

// ===== ALERT MANAGEMENT ROUTES =====
router.post('/alerts/generate', itemController.generateStockAlerts);
router.get('/alerts', itemController.getActiveAlerts);
router.put('/alerts/:alertId/resolve', itemController.resolveAlert);
router.put('/alerts/bulk-resolve', itemController.bulkResolveAlerts);
router.get('/alerts/statistics', itemController.getAlertStatistics);
router.get('/items/:id/alerts', itemController.getItemAlerts);

// ===== BATCH TRACKING ROUTES =====
router.post('/batches', itemController.createProductionBatch);
router.put('/batches/:batchId/start', itemController.startProductionBatch);
router.put('/batches/:batchId/complete', itemController.completeProductionBatch);
router.get('/batches/:batchId/traceability', itemController.getBatchTraceability);
router.get('/products/:productId/batches', itemController.getProductBatchHistory);
router.get('/items/:itemId/traceability', itemController.getIngredientTraceability);
router.put('/batches/:batchId/cancel', itemController.cancelProductionBatch);

// ===== ANALYTICS ROUTES =====
router.get('/analytics/dashboard', itemController.getInventoryDashboard);
router.get('/analytics/valuation', itemController.getInventoryValuation);
router.get('/analytics/turnover', itemController.getStockTurnoverAnalysis);
router.get('/analytics/aging', itemController.getInventoryAging);
router.get('/analytics/performance', itemController.getInventoryPerformance);

module.exports = router;


