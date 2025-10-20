/**
 * External API Integration Service
 * 
 * Comprehensive service for integrating with external APIs, suppliers, customers, and third-party services
 * Supports multiple API providers with unified interface and data synchronization
 */

const axios = require('axios');
const { logger } = require('../config/logger');
const { ValidationError } = require('../core/exceptions');

class ExternalAPIService {
  constructor() {
    this.apiClients = new Map();
    this.syncJobs = new Map();
    this.rateLimiters = new Map();
    this.initializeAPIClients();
  }

  /**
   * Initialize API clients
   */
  initializeAPIClients() {
    // Supplier API clients
    if (process.env.SUPPLIER_API_BASE_URL) {
      this.apiClients.set('supplier-api', {
        name: 'Supplier API',
        baseURL: process.env.SUPPLIER_API_BASE_URL,
        timeout: 30000,
        headers: {
          'Authorization': `Bearer ${process.env.SUPPLIER_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        rateLimit: {
          requests: 100,
          window: 60000 // 1 minute
        }
      });
    }

    // Customer API clients
    if (process.env.CUSTOMER_API_BASE_URL) {
      this.apiClients.set('customer-api', {
        name: 'Customer API',
        baseURL: process.env.CUSTOMER_API_BASE_URL,
        timeout: 30000,
        headers: {
          'Authorization': `Bearer ${process.env.CUSTOMER_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        rateLimit: {
          requests: 100,
          window: 60000
        }
      });
    }

    // Shipping API clients
    if (process.env.SHIPPING_API_BASE_URL) {
      this.apiClients.set('shipping-api', {
        name: 'Shipping API',
        baseURL: process.env.SHIPPING_API_BASE_URL,
        timeout: 30000,
        headers: {
          'Authorization': `Bearer ${process.env.SHIPPING_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        rateLimit: {
          requests: 50,
          window: 60000
        }
      });
    }

    // Accounting API clients
    if (process.env.ACCOUNTING_API_BASE_URL) {
      this.apiClients.set('accounting-api', {
        name: 'Accounting API',
        baseURL: process.env.ACCOUNTING_API_BASE_URL,
        timeout: 30000,
        headers: {
          'Authorization': `Bearer ${process.env.ACCOUNTING_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        rateLimit: {
          requests: 200,
          window: 60000
        }
      });
    }

    // Inventory API clients
    if (process.env.INVENTORY_API_BASE_URL) {
      this.apiClients.set('inventory-api', {
        name: 'Inventory API',
        baseURL: process.env.INVENTORY_API_BASE_URL,
        timeout: 30000,
        headers: {
          'Authorization': `Bearer ${process.env.INVENTORY_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        rateLimit: {
          requests: 150,
          window: 60000
        }
      });
    }
  }

  /**
   * Make API request
   */
  async makeRequest(clientName, endpoint, method = 'GET', data = null, options = {}) {
    try {
      if (!this.apiClients.has(clientName)) {
        throw new ValidationError(`API client '${clientName}' is not configured`);
      }

      const client = this.apiClients.get(clientName);
      
      // Check rate limit
      if (!this.checkRateLimit(clientName)) {
        throw new Error(`Rate limit exceeded for ${clientName}`);
      }

      const config = {
        method,
        url: `${client.baseURL}${endpoint}`,
        headers: {
          ...client.headers,
          ...options.headers
        },
        timeout: options.timeout || client.timeout,
        ...(data && { data })
      };

      const response = await axios(config);
      
      logger.info({
        clientName,
        endpoint,
        method,
        status: response.status
      }, 'API request successful');

      return {
        success: true,
        data: response.data,
        status: response.status,
        headers: response.headers
      };

    } catch (error) {
      logger.error({
        error: error.message,
        clientName,
        endpoint,
        method
      }, 'API request failed');
      
      if (error.response) {
        throw new Error(`API request failed: ${error.response.status} - ${error.response.data?.message || error.message}`);
      } else if (error.request) {
        throw new Error(`API request timeout: ${error.message}`);
      } else {
        throw new Error(`API request error: ${error.message}`);
      }
    }
  }

  /**
   * Check rate limit
   */
  checkRateLimit(clientName) {
    const client = this.apiClients.get(clientName);
    if (!client || !client.rateLimit) {
      return true;
    }

    const now = Date.now();
    const window = client.rateLimit.window;
    const limit = client.rateLimit.requests;

    if (!this.rateLimiters.has(clientName)) {
      this.rateLimiters.set(clientName, []);
    }

    const requests = this.rateLimiters.get(clientName);
    
    // Remove old requests outside the window
    const validRequests = requests.filter(time => now - time < window);
    this.rateLimiters.set(clientName, validRequests);

    if (validRequests.length >= limit) {
      return false;
    }

    // Add current request
    validRequests.push(now);
    this.rateLimiters.set(clientName, validRequests);

    return true;
  }

  /**
   * Sync supplier data
   */
  async syncSupplierData(tenantId, supplierId = null) {
    try {
      const endpoint = supplierId ? `/suppliers/${supplierId}` : '/suppliers';
      const response = await this.makeRequest('supplier-api', endpoint);
      
      if (response.success) {
        const suppliers = Array.isArray(response.data) ? response.data : [response.data];
        
        // Process and sync supplier data
        for (const supplier of suppliers) {
          await this.processSupplierData(tenantId, supplier);
        }

        logger.info({
          tenantId,
          supplierId,
          count: suppliers.length
        }, 'Supplier data synced successfully');

        return {
          success: true,
          count: suppliers.length,
          suppliers
        };
      }

    } catch (error) {
      logger.error({
        error: error.message,
        tenantId,
        supplierId
      }, 'Supplier data sync failed');
      throw error;
    }
  }

  /**
   * Process supplier data
   */
  async processSupplierData(tenantId, supplierData) {
    // This would typically involve updating the local database
    // with the supplier information from the external API
    logger.info({
      tenantId,
      supplierId: supplierData.id,
      supplierName: supplierData.name
    }, 'Processing supplier data');
  }

  /**
   * Sync customer data
   */
  async syncCustomerData(tenantId, customerId = null) {
    try {
      const endpoint = customerId ? `/customers/${customerId}` : '/customers';
      const response = await this.makeRequest('customer-api', endpoint);
      
      if (response.success) {
        const customers = Array.isArray(response.data) ? response.data : [response.data];
        
        // Process and sync customer data
        for (const customer of customers) {
          await this.processCustomerData(tenantId, customer);
        }

        logger.info({
          tenantId,
          customerId,
          count: customers.length
        }, 'Customer data synced successfully');

        return {
          success: true,
          count: customers.length,
          customers
        };
      }

    } catch (error) {
      logger.error({
        error: error.message,
        tenantId,
        customerId
      }, 'Customer data sync failed');
      throw error;
    }
  }

  /**
   * Process customer data
   */
  async processCustomerData(tenantId, customerData) {
    // This would typically involve updating the local database
    // with the customer information from the external API
    logger.info({
      tenantId,
      customerId: customerData.id,
      customerName: customerData.name
    }, 'Processing customer data');
  }

  /**
   * Get shipping rates
   */
  async getShippingRates(shippingData) {
    try {
      const { origin, destination, weight, dimensions, serviceType } = shippingData;
      
      const response = await this.makeRequest('shipping-api', '/rates', 'POST', {
        origin,
        destination,
        weight,
        dimensions,
        serviceType
      });

      if (response.success) {
        logger.info({
          origin,
          destination,
          weight
        }, 'Shipping rates retrieved successfully');

        return {
          success: true,
          rates: response.data.rates || []
        };
      }

    } catch (error) {
      logger.error({
        error: error.message,
        shippingData
      }, 'Failed to get shipping rates');
      throw error;
    }
  }

  /**
   * Create shipping label
   */
  async createShippingLabel(labelData) {
    try {
      const { orderId, recipient, sender, packageInfo, serviceType } = labelData;
      
      const response = await this.makeRequest('shipping-api', '/labels', 'POST', {
        orderId,
        recipient,
        sender,
        packageInfo,
        serviceType
      });

      if (response.success) {
        logger.info({
          orderId,
          serviceType
        }, 'Shipping label created successfully');

        return {
          success: true,
          labelId: response.data.labelId,
          trackingNumber: response.data.trackingNumber,
          labelUrl: response.data.labelUrl
        };
      }

    } catch (error) {
      logger.error({
        error: error.message,
        labelData
      }, 'Failed to create shipping label');
      throw error;
    }
  }

  /**
   * Track shipment
   */
  async trackShipment(trackingNumber) {
    try {
      const response = await this.makeRequest('shipping-api', `/track/${trackingNumber}`);
      
      if (response.success) {
        logger.info({
          trackingNumber
        }, 'Shipment tracking data retrieved successfully');

        return {
          success: true,
          trackingData: response.data
        };
      }

    } catch (error) {
      logger.error({
        error: error.message,
        trackingNumber
      }, 'Failed to track shipment');
      throw error;
    }
  }

  /**
   * Sync accounting data
   */
  async syncAccountingData(tenantId, dataType, dateRange = null) {
    try {
      let endpoint = `/accounting/${dataType}`;
      if (dateRange) {
        endpoint += `?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`;
      }

      const response = await this.makeRequest('accounting-api', endpoint);
      
      if (response.success) {
        logger.info({
          tenantId,
          dataType,
          dateRange
        }, 'Accounting data synced successfully');

        return {
          success: true,
          data: response.data
        };
      }

    } catch (error) {
      logger.error({
        error: error.message,
        tenantId,
        dataType,
        dateRange
      }, 'Accounting data sync failed');
      throw error;
    }
  }

  /**
   * Sync inventory data
   */
  async syncInventoryData(tenantId, warehouseId = null) {
    try {
      const endpoint = warehouseId ? `/inventory/${warehouseId}` : '/inventory';
      const response = await this.makeRequest('inventory-api', endpoint);
      
      if (response.success) {
        const inventoryData = Array.isArray(response.data) ? response.data : [response.data];
        
        // Process and sync inventory data
        for (const item of inventoryData) {
          await this.processInventoryData(tenantId, item);
        }

        logger.info({
          tenantId,
          warehouseId,
          count: inventoryData.length
        }, 'Inventory data synced successfully');

        return {
          success: true,
          count: inventoryData.length,
          inventoryData
        };
      }

    } catch (error) {
      logger.error({
        error: error.message,
        tenantId,
        warehouseId
      }, 'Inventory data sync failed');
      throw error;
    }
  }

  /**
   * Process inventory data
   */
  async processInventoryData(tenantId, inventoryData) {
    // This would typically involve updating the local inventory
    // with the data from the external API
    logger.info({
      tenantId,
      itemId: inventoryData.id,
      itemName: inventoryData.name,
      quantity: inventoryData.quantity
    }, 'Processing inventory data');
  }

  /**
   * Schedule sync job
   */
  async scheduleSyncJob(jobName, jobFunction, interval) {
    try {
      if (this.syncJobs.has(jobName)) {
        clearInterval(this.syncJobs.get(jobName));
      }

      const jobId = setInterval(async () => {
        try {
          await jobFunction();
        } catch (error) {
          logger.error({
            error: error.message,
            jobName
          }, 'Sync job failed');
        }
      }, interval);

      this.syncJobs.set(jobName, jobId);
      
      logger.info({
        jobName,
        interval
      }, 'Sync job scheduled');

      return {
        success: true,
        jobName,
        interval
      };

    } catch (error) {
      logger.error({
        error: error.message,
        jobName
      }, 'Failed to schedule sync job');
      throw error;
    }
  }

  /**
   * Cancel sync job
   */
  async cancelSyncJob(jobName) {
    try {
      if (this.syncJobs.has(jobName)) {
        clearInterval(this.syncJobs.get(jobName));
        this.syncJobs.delete(jobName);
        
        logger.info({
          jobName
        }, 'Sync job cancelled');

        return { success: true };
      } else {
        throw new ValidationError(`Sync job '${jobName}' not found`);
      }

    } catch (error) {
      logger.error({
        error: error.message,
        jobName
      }, 'Failed to cancel sync job');
      throw error;
    }
  }

  /**
   * Test API connection
   */
  async testAPIConnection(clientName) {
    try {
      if (!this.apiClients.has(clientName)) {
        throw new ValidationError(`API client '${clientName}' is not configured`);
      }

      const response = await this.makeRequest(clientName, '/health');
      
      return {
        status: 'success',
        message: 'API connection successful',
        responseTime: response.headers['x-response-time'] || 'N/A'
      };

    } catch (error) {
      return {
        status: 'error',
        message: error.message
      };
    }
  }

  /**
   * Get API client information
   */
  getAPIClientInfo(clientName) {
    if (!this.apiClients.has(clientName)) {
      return null;
    }

    const client = this.apiClients.get(clientName);
    return {
      name: client.name,
      baseURL: client.baseURL,
      timeout: client.timeout,
      rateLimit: client.rateLimit
    };
  }

  /**
   * Get available API clients
   */
  getAvailableAPIClients() {
    return Array.from(this.apiClients.keys());
  }

  /**
   * Get active sync jobs
   */
  getActiveSyncJobs() {
    return Array.from(this.syncJobs.keys());
  }

  /**
   * Get API statistics
   */
  async getStatistics() {
    return {
      availableClients: this.getAvailableAPIClients(),
      activeSyncJobs: this.getActiveSyncJobs(),
      rateLimiters: Array.from(this.rateLimiters.keys()),
      status: 'active'
    };
  }
}

// Create singleton instance
const externalAPIService = new ExternalAPIService();

module.exports = {
  externalAPIService,
  ExternalAPIService
};
