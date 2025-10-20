/**
 * Integration Routes
 * 
 * Routes for managing integrations, monitoring their health,
 * and providing unified access to integration services
 */

const { Router } = require('express');
const { authenticateToken, requireTenantAccess } = require('../../core/middlewares/auth');
const integrationController = require('./integration.controller');

const router = Router();

// Apply authentication and tenant access to all routes
router.use(authenticateToken);
router.use(requireTenantAccess);

/**
 * Integration Management Routes
 * 
 * GET /integrations/status - Get all integration services status
 * GET /integrations/health/:serviceName - Check health of specific service
 * GET /integrations/health - Check health of all services
 * GET /integrations/metrics - Get integration metrics
 * GET /integrations/services/:serviceName - Get service information
 * POST /integrations/initialize - Initialize all services
 * POST /integrations/shutdown - Shutdown all services
 * 
 * Testing Routes
 * POST /integrations/test/notification - Send test notification
 * POST /integrations/test/payment - Process test payment
 * POST /integrations/test/event - Publish test event
 * POST /integrations/test/file - Upload test file
 * POST /integrations/test/sync - Sync external data
 */

// Status and health routes
router.get('/status', integrationController.getIntegrationStatus);
router.get('/health/:serviceName', integrationController.checkServiceHealth);
router.get('/health', integrationController.checkAllServicesHealth);
router.get('/metrics', integrationController.getIntegrationMetrics);
router.get('/services/:serviceName', integrationController.getServiceInfo);

// Service management routes
router.post('/initialize', integrationController.initializeAllServices);
router.post('/shutdown', integrationController.shutdownAllServices);

// Testing routes
router.post('/test/notification', integrationController.sendTestNotification);
router.post('/test/payment', integrationController.processTestPayment);
router.post('/test/event', integrationController.publishTestEvent);
router.post('/test/file', integrationController.uploadTestFile);
router.post('/test/sync', integrationController.syncExternalData);

module.exports = router;
