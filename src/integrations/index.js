/**
 * Integration Management Service
 * 
 * Centralized service for managing all integrations, monitoring their health,
 * and providing unified access to integration services
 */

const { logger } = require('../config/logger');
const { ValidationError } = require('../core/exceptions');

// Import all integration services
const { emailService } = require('./emailService');
const { smsService } = require('./smsService');
const { paymentGatewayService } = require('./paymentGateway');
const { kafkaService } = require('./kafka');
const { fileStorageService } = require('./fileStorageService');
const { externalAPIService } = require('./externalAPIService');

class IntegrationManager {
  constructor() {
    this.services = new Map();
    this.healthChecks = new Map();
    this.metrics = new Map();
    this.initializeServices();
    this.initializeHealthChecks();
  }

  /**
   * Initialize all integration services
   */
  initializeServices() {
    this.services.set('email', {
      service: emailService,
      name: 'Email Service',
      type: 'communication',
      status: 'active',
      dependencies: ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']
    });

    this.services.set('sms', {
      service: smsService,
      name: 'SMS Service',
      type: 'communication',
      status: 'active',
      dependencies: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN']
    });

    this.services.set('payment', {
      service: paymentGatewayService,
      name: 'Payment Gateway',
      type: 'payment',
      status: 'active',
      dependencies: ['STRIPE_SECRET_KEY']
    });

    this.services.set('kafka', {
      service: kafkaService,
      name: 'Kafka Service',
      type: 'messaging',
      status: 'active',
      dependencies: ['KAFKA_BROKERS']
    });

    this.services.set('fileStorage', {
      service: fileStorageService,
      name: 'File Storage Service',
      type: 'storage',
      status: 'active',
      dependencies: []
    });

    this.services.set('externalAPI', {
      service: externalAPIService,
      name: 'External API Service',
      type: 'integration',
      status: 'active',
      dependencies: []
    });
  }

  /**
   * Initialize health check functions
   */
  initializeHealthChecks() {
    this.healthChecks.set('email', async () => {
      try {
        const result = await emailService.testConfiguration();
        return {
          status: 'healthy',
          details: result
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          error: error.message
        };
      }
    });

    this.healthChecks.set('sms', async () => {
      try {
        const result = await smsService.testConfiguration(process.env.TEST_PHONE_NUMBER);
        return {
          status: 'healthy',
          details: result
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          error: error.message
        };
      }
    });

    this.healthChecks.set('payment', async () => {
      try {
        const result = await paymentGatewayService.testConfiguration('stripe');
        return {
          status: 'healthy',
          details: result
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          error: error.message
        };
      }
    });

    this.healthChecks.set('kafka', async () => {
      try {
        const result = await kafkaService.testConnection();
        return {
          status: 'healthy',
          details: result
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          error: error.message
        };
      }
    });

    this.healthChecks.set('fileStorage', async () => {
      try {
        const result = await fileStorageService.testProvider('local');
        return {
          status: 'healthy',
          details: result
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          error: error.message
        };
      }
    });

    this.healthChecks.set('externalAPI', async () => {
      try {
        const result = await externalAPIService.testAPIConnection('supplier-api');
        return {
          status: 'healthy',
          details: result
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          error: error.message
        };
      }
    });
  }

  /**
   * Get service by name
   */
  getService(serviceName) {
    if (!this.services.has(serviceName)) {
      throw new ValidationError(`Service '${serviceName}' not found`);
    }

    return this.services.get(serviceName).service;
  }

  /**
   * Get service information
   */
  getServiceInfo(serviceName) {
    if (!this.services.has(serviceName)) {
      throw new ValidationError(`Service '${serviceName}' not found`);
    }

    const service = this.services.get(serviceName);
    return {
      name: service.name,
      type: service.type,
      status: service.status,
      dependencies: service.dependencies
    };
  }

  /**
   * Check service health
   */
  async checkServiceHealth(serviceName) {
    try {
      if (!this.healthChecks.has(serviceName)) {
        throw new ValidationError(`Health check for service '${serviceName}' not found`);
      }

      const healthCheck = this.healthChecks.get(serviceName);
      const result = await healthCheck();

      // Update service status
      if (this.services.has(serviceName)) {
        this.services.get(serviceName).status = result.status === 'healthy' ? 'active' : 'inactive';
      }

      return result;

    } catch (error) {
      logger.error({
        error: error.message,
        serviceName
      }, 'Health check failed');
      throw error;
    }
  }

  /**
   * Check all services health
   */
  async checkAllServicesHealth() {
    const results = {};

    for (const serviceName of this.services.keys()) {
      try {
        results[serviceName] = await this.checkServiceHealth(serviceName);
      } catch (error) {
        results[serviceName] = {
          status: 'error',
          error: error.message
        };
      }
    }

    return results;
  }

  /**
   * Send notification using available services
   */
  async sendNotification({
    type = 'email',
    recipients,
    template,
    data = {},
    priority = 'normal',
    fallbackServices = ['sms']
  }) {
    try {
      const primaryService = this.getService(type);
      let result;

      try {
        // Try primary service
        if (type === 'email') {
          result = await primaryService.sendEmail({
            to: recipients.map(r => r.email),
            template,
            data,
            priority
          });
        } else if (type === 'sms') {
          result = await primaryService.sendSMS({
            to: recipients.map(r => r.phone),
            template,
            data,
            priority
          });
        }

        logger.info({
          type,
          recipientCount: recipients.length,
          template
        }, 'Notification sent successfully');

        return result;

      } catch (primaryError) {
        logger.warn({
          error: primaryError.message,
          type
        }, 'Primary notification service failed, trying fallback');

        // Try fallback services
        for (const fallbackType of fallbackServices) {
          try {
            const fallbackService = this.getService(fallbackType);
            
            if (fallbackType === 'email') {
              result = await fallbackService.sendEmail({
                to: recipients.map(r => r.email),
                template,
                data,
                priority
              });
            } else if (fallbackType === 'sms') {
              result = await fallbackService.sendSMS({
                to: recipients.map(r => r.phone),
                template,
                data,
                priority
              });
            }

            logger.info({
              fallbackType,
              recipientCount: recipients.length,
              template
            }, 'Fallback notification sent successfully');

            return result;

          } catch (fallbackError) {
            logger.warn({
              error: fallbackError.message,
              fallbackType
            }, 'Fallback notification service also failed');
          }
        }

        throw new Error('All notification services failed');
      }

    } catch (error) {
      logger.error({
        error: error.message,
        type,
        recipientCount: recipients.length
      }, 'Notification sending failed');
      throw error;
    }
  }

  /**
   * Process payment using available gateways
   */
  async processPayment(paymentData, preferredGateway = 'stripe') {
    try {
      const paymentService = this.getService('payment');
      
      // Try preferred gateway first
      try {
        const result = await paymentService.processPayment({
          ...paymentData,
          gateway: preferredGateway
        });

        logger.info({
          gateway: preferredGateway,
          amount: paymentData.amount,
          orderId: paymentData.orderId
        }, 'Payment processed successfully');

        return result;

      } catch (preferredError) {
        logger.warn({
          error: preferredError.message,
          gateway: preferredGateway
        }, 'Preferred payment gateway failed, trying alternatives');

        // Try alternative gateways
        const availableGateways = paymentService.getAvailableGateways();
        const alternativeGateways = availableGateways.filter(g => g !== preferredGateway);

        for (const gateway of alternativeGateways) {
          try {
            const result = await paymentService.processPayment({
              ...paymentData,
              gateway
            });

            logger.info({
              gateway,
              amount: paymentData.amount,
              orderId: paymentData.orderId
            }, 'Payment processed successfully with alternative gateway');

            return result;

          } catch (alternativeError) {
            logger.warn({
              error: alternativeError.message,
              gateway
            }, 'Alternative payment gateway also failed');
          }
        }

        throw new Error('All payment gateways failed');
      }

    } catch (error) {
      logger.error({
        error: error.message,
        amount: paymentData.amount,
        orderId: paymentData.orderId
      }, 'Payment processing failed');
      throw error;
    }
  }

  /**
   * Publish event to messaging system
   */
  async publishEvent(topic, eventType, data) {
    try {
      const kafkaService = this.getService('kafka');
      
      const result = await kafkaService.publishEvent(topic, eventType, data);
      
      logger.info({
        topic,
        eventType,
        partition: result.partition,
        offset: result.offset
      }, 'Event published successfully');

      return result;

    } catch (error) {
      logger.error({
        error: error.message,
        topic,
        eventType
      }, 'Event publishing failed');
      throw error;
    }
  }

  /**
   * Upload file using available storage
   */
  async uploadFile(fileData, options = {}) {
    try {
      const fileStorageService = this.getService('fileStorage');
      
      const result = await fileStorageService.uploadFile({
        ...fileData,
        ...options
      });
      
      logger.info({
        fileName: fileData.fileName,
        size: fileData.fileData.length,
        provider: result.provider
      }, 'File uploaded successfully');

      return result;

    } catch (error) {
      logger.error({
        error: error.message,
        fileName: fileData.fileName
      }, 'File upload failed');
      throw error;
    }
  }

  /**
   * Sync external data
   */
  async syncExternalData(tenantId, dataType, options = {}) {
    try {
      const externalAPIService = this.getService('externalAPI');
      
      let result;
      switch (dataType) {
        case 'suppliers':
          result = await externalAPIService.syncSupplierData(tenantId, options.supplierId);
          break;
        case 'customers':
          result = await externalAPIService.syncCustomerData(tenantId, options.customerId);
          break;
        case 'inventory':
          result = await externalAPIService.syncInventoryData(tenantId, options.warehouseId);
          break;
        case 'accounting':
          result = await externalAPIService.syncAccountingData(tenantId, options.dataType, options.dateRange);
          break;
        default:
          throw new ValidationError(`Unknown data type: ${dataType}`);
      }
      
      logger.info({
        tenantId,
        dataType,
        count: result.count || 0
      }, 'External data synced successfully');

      return result;

    } catch (error) {
      logger.error({
        error: error.message,
        tenantId,
        dataType
      }, 'External data sync failed');
      throw error;
    }
  }

  /**
   * Get integration metrics
   */
  async getMetrics() {
    const metrics = {};

    for (const [serviceName, serviceInfo] of this.services) {
      try {
        const service = serviceInfo.service;
        if (service.getStatistics) {
          metrics[serviceName] = await service.getStatistics();
        }
      } catch (error) {
        metrics[serviceName] = {
          error: error.message
        };
      }
    }

    return metrics;
  }

  /**
   * Get service status summary
   */
  async getStatusSummary() {
    const healthResults = await this.checkAllServicesHealth();
    const summary = {
      total: Object.keys(healthResults).length,
      healthy: 0,
      unhealthy: 0,
      error: 0,
      services: {}
    };

    for (const [serviceName, health] of Object.entries(healthResults)) {
      summary.services[serviceName] = {
        status: health.status,
        name: this.services.get(serviceName)?.name || serviceName,
        type: this.services.get(serviceName)?.type || 'unknown'
      };

      if (health.status === 'healthy') {
        summary.healthy++;
      } else if (health.status === 'unhealthy') {
        summary.unhealthy++;
      } else {
        summary.error++;
      }
    }

    return summary;
  }

  /**
   * Initialize all services
   */
  async initializeAllServices() {
    const results = {};

    for (const [serviceName, serviceInfo] of this.services) {
      try {
        const service = serviceInfo.service;
        if (service.connect) {
          await service.connect();
        }
        results[serviceName] = { status: 'initialized' };
      } catch (error) {
        results[serviceName] = { status: 'failed', error: error.message };
      }
    }

    return results;
  }

  /**
   * Shutdown all services
   */
  async shutdownAllServices() {
    const results = {};

    for (const [serviceName, serviceInfo] of this.services) {
      try {
        const service = serviceInfo.service;
        if (service.disconnect) {
          await service.disconnect();
        }
        results[serviceName] = { status: 'shutdown' };
      } catch (error) {
        results[serviceName] = { status: 'failed', error: error.message };
      }
    }

    return results;
  }
}

// Create singleton instance
const integrationManager = new IntegrationManager();

module.exports = {
  integrationManager,
  IntegrationManager
};
