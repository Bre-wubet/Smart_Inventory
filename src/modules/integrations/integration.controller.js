/**
 * Integration Controller
 * 
 * Controller for managing integrations, monitoring their health,
 * and providing unified access to integration services
 */

const { integrationManager } = require('../integrations');
const { ValidationError } = require('../../core/exceptions');
const { logger } = require('../../config/logger');

/**
 * Get all integration services status
 */
async function getIntegrationStatus(req, res) {
  try {
    const statusSummary = await integrationManager.getStatusSummary();
    
    res.json({
      success: true,
      data: statusSummary
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get integration status');
    res.status(500).json({
      success: false,
      message: 'Failed to get integration status',
      error: error.message
    });
  }
}

/**
 * Check health of specific service
 */
async function checkServiceHealth(req, res) {
  try {
    const { serviceName } = req.params;
    
    const healthResult = await integrationManager.checkServiceHealth(serviceName);
    
    res.json({
      success: true,
      data: {
        serviceName,
        ...healthResult
      }
    });
  } catch (error) {
    logger.error({ 
      error: error.message, 
      serviceName: req.params.serviceName 
    }, 'Failed to check service health');
    
    res.status(500).json({
      success: false,
      message: 'Failed to check service health',
      error: error.message
    });
  }
}

/**
 * Check health of all services
 */
async function checkAllServicesHealth(req, res) {
  try {
    const healthResults = await integrationManager.checkAllServicesHealth();
    
    res.json({
      success: true,
      data: healthResults
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to check all services health');
    res.status(500).json({
      success: false,
      message: 'Failed to check all services health',
      error: error.message
    });
  }
}

/**
 * Send test notification
 */
async function sendTestNotification(req, res) {
  try {
    const { type = 'email', recipients, template, data } = req.body;
    
    if (!recipients || recipients.length === 0) {
      throw new ValidationError('Recipients are required');
    }

    const result = await integrationManager.sendNotification({
      type,
      recipients,
      template: template || 'custom',
      data: data || { message: 'Test notification from Smart Inventory ERP' },
      priority: 'normal'
    });
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to send test notification');
    res.status(500).json({
      success: false,
      message: 'Failed to send test notification',
      error: error.message
    });
  }
}

/**
 * Process test payment
 */
async function processTestPayment(req, res) {
  try {
    const { amount, currency = 'USD', gateway = 'stripe', orderId } = req.body;
    
    if (!amount || amount <= 0) {
      throw new ValidationError('Valid payment amount is required');
    }

    const result = await integrationManager.processPayment({
      amount,
      currency,
      gateway,
      orderId: orderId || `test_${Date.now()}`,
      tenantId: req.tenantId,
      paymentMethodId: 'test_payment_method',
      customerId: 'test_customer'
    });
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to process test payment');
    res.status(500).json({
      success: false,
      message: 'Failed to process test payment',
      error: error.message
    });
  }
}

/**
 * Publish test event
 */
async function publishTestEvent(req, res) {
  try {
    const { topic, eventType, data } = req.body;
    
    if (!topic || !eventType) {
      throw new ValidationError('Topic and event type are required');
    }

    const result = await integrationManager.publishEvent(topic, eventType, {
      ...data,
      tenantId: req.tenantId,
      timestamp: new Date().toISOString()
    });
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to publish test event');
    res.status(500).json({
      success: false,
      message: 'Failed to publish test event',
      error: error.message
    });
  }
}

/**
 * Upload test file
 */
async function uploadTestFile(req, res) {
  try {
    const { fileName, fileType = 'document', category = 'test' } = req.body;
    
    if (!fileName) {
      throw new ValidationError('File name is required');
    }

    const testData = Buffer.from('Test file content for Smart Inventory ERP');
    
    const result = await integrationManager.uploadFile({
      fileData: testData,
      fileName,
      fileType,
      tenantId: req.tenantId,
      category
    });
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to upload test file');
    res.status(500).json({
      success: false,
      message: 'Failed to upload test file',
      error: error.message
    });
  }
}

/**
 * Sync external data
 */
async function syncExternalData(req, res) {
  try {
    const { dataType, options = {} } = req.body;
    
    if (!dataType) {
      throw new ValidationError('Data type is required');
    }

    const result = await integrationManager.syncExternalData(req.tenantId, dataType, options);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to sync external data');
    res.status(500).json({
      success: false,
      message: 'Failed to sync external data',
      error: error.message
    });
  }
}

/**
 * Get integration metrics
 */
async function getIntegrationMetrics(req, res) {
  try {
    const metrics = await integrationManager.getMetrics();
    
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get integration metrics');
    res.status(500).json({
      success: false,
      message: 'Failed to get integration metrics',
      error: error.message
    });
  }
}

/**
 * Get service information
 */
async function getServiceInfo(req, res) {
  try {
    const { serviceName } = req.params;
    
    const serviceInfo = integrationManager.getServiceInfo(serviceName);
    
    res.json({
      success: true,
      data: serviceInfo
    });
  } catch (error) {
    logger.error({ 
      error: error.message, 
      serviceName: req.params.serviceName 
    }, 'Failed to get service info');
    
    res.status(500).json({
      success: false,
      message: 'Failed to get service info',
      error: error.message
    });
  }
}

/**
 * Initialize all services
 */
async function initializeAllServices(req, res) {
  try {
    const results = await integrationManager.initializeAllServices();
    
    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to initialize all services');
    res.status(500).json({
      success: false,
      message: 'Failed to initialize all services',
      error: error.message
    });
  }
}

/**
 * Shutdown all services
 */
async function shutdownAllServices(req, res) {
  try {
    const results = await integrationManager.shutdownAllServices();
    
    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to shutdown all services');
    res.status(500).json({
      success: false,
      message: 'Failed to shutdown all services',
      error: error.message
    });
  }
}

module.exports = {
  getIntegrationStatus,
  checkServiceHealth,
  checkAllServicesHealth,
  sendTestNotification,
  processTestPayment,
  publishTestEvent,
  uploadTestFile,
  syncExternalData,
  getIntegrationMetrics,
  getServiceInfo,
  initializeAllServices,
  shutdownAllServices
};
