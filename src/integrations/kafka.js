/**
 * Kafka Integration Service
 * 
 * Comprehensive Kafka service for event streaming, real-time updates, and message queuing
 * Supports multiple topics, producers, consumers, and event schemas
 */

const { Kafka } = require('kafkajs');
const { logger } = require('../config/logger');
const { ValidationError } = require('../core/exceptions');

class KafkaService {
  constructor() {
    this.kafka = null;
    this.producer = null;
    this.consumers = new Map();
    this.topics = new Map();
    this.eventSchemas = new Map();
    this.initializeKafka();
    this.initializeEventSchemas();
  }

  /**
   * Initialize Kafka connection
   */
  initializeKafka() {
    if (process.env.KAFKA_BROKERS) {
      this.kafka = Kafka({
        clientId: process.env.KAFKA_CLIENT_ID || 'smart-inventory-erp',
        brokers: process.env.KAFKA_BROKERS.split(','),
        retry: {
          initialRetryTime: 100,
          retries: 8
        },
        connectionTimeout: 3000,
        requestTimeout: 25000
      });

      this.producer = this.kafka.producer({
        maxInFlightRequests: 1,
        idempotent: true,
        transactionTimeout: 30000
      });

      logger.info('Kafka service initialized');
    } else {
      logger.warn('Kafka brokers not configured, service will be disabled');
    }
  }

  /**
   * Initialize event schemas
   */
  initializeEventSchemas() {
    // Inventory events
    this.eventSchemas.set('inventory.stock.updated', {
      version: '1.0',
      schema: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' },
          itemId: { type: 'string' },
          warehouseId: { type: 'string' },
          oldQuantity: { type: 'number' },
          newQuantity: { type: 'number' },
          transactionType: { type: 'string' },
          transactionId: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' }
        },
        required: ['tenantId', 'itemId', 'warehouseId', 'newQuantity', 'timestamp']
      }
    });

    this.eventSchemas.set('inventory.item.created', {
      version: '1.0',
      schema: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' },
          itemId: { type: 'string' },
          itemName: { type: 'string' },
          sku: { type: 'string' },
          category: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' }
        },
        required: ['tenantId', 'itemId', 'itemName', 'sku', 'timestamp']
      }
    });

    // Sales events
    this.eventSchemas.set('sales.order.created', {
      version: '1.0',
      schema: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' },
          orderId: { type: 'string' },
          customerId: { type: 'string' },
          totalAmount: { type: 'number' },
          currency: { type: 'string' },
          status: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' }
        },
        required: ['tenantId', 'orderId', 'totalAmount', 'currency', 'status', 'timestamp']
      }
    });

    this.eventSchemas.set('sales.order.fulfilled', {
      version: '1.0',
      schema: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' },
          orderId: { type: 'string' },
          customerId: { type: 'string' },
          fulfillmentDate: { type: 'string', format: 'date-time' },
          timestamp: { type: 'string', format: 'date-time' }
        },
        required: ['tenantId', 'orderId', 'fulfillmentDate', 'timestamp']
      }
    });

    // Purchase events
    this.eventSchemas.set('purchase.order.created', {
      version: '1.0',
      schema: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' },
          orderId: { type: 'string' },
          supplierId: { type: 'string' },
          totalAmount: { type: 'number' },
          currency: { type: 'string' },
          status: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' }
        },
        required: ['tenantId', 'orderId', 'totalAmount', 'currency', 'status', 'timestamp']
      }
    });

    this.eventSchemas.set('purchase.order.received', {
      version: '1.0',
      schema: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' },
          orderId: { type: 'string' },
          supplierId: { type: 'string' },
          receivedDate: { type: 'string', format: 'date-time' },
          timestamp: { type: 'string', format: 'date-time' }
        },
        required: ['tenantId', 'orderId', 'receivedDate', 'timestamp']
      }
    });

    // Alert events
    this.eventSchemas.set('alert.created', {
      version: '1.0',
      schema: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' },
          alertId: { type: 'string' },
          alertType: { type: 'string' },
          priority: { type: 'string' },
          itemId: { type: 'string' },
          warehouseId: { type: 'string' },
          message: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' }
        },
        required: ['tenantId', 'alertId', 'alertType', 'priority', 'timestamp']
      }
    });

    // User events
    this.eventSchemas.set('user.login', {
      version: '1.0',
      schema: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' },
          userId: { type: 'string' },
          userEmail: { type: 'string' },
          loginTime: { type: 'string', format: 'date-time' },
          ipAddress: { type: 'string' },
          userAgent: { type: 'string' }
        },
        required: ['tenantId', 'userId', 'loginTime']
      }
    });

    // Analytics events
    this.eventSchemas.set('analytics.report.generated', {
      version: '1.0',
      schema: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' },
          reportId: { type: 'string' },
          reportType: { type: 'string' },
          generatedAt: { type: 'string', format: 'date-time' },
          parameters: { type: 'object' }
        },
        required: ['tenantId', 'reportId', 'reportType', 'generatedAt']
      }
    });
  }

  /**
   * Connect to Kafka
   */
  async connect() {
    if (!this.kafka) {
      throw new Error('Kafka is not configured');
    }

    try {
      await this.producer.connect();
      logger.info('Connected to Kafka producer');
      return true;
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to connect to Kafka');
      throw error;
    }
  }

  /**
   * Disconnect from Kafka
   */
  async disconnect() {
    try {
      if (this.producer) {
        await this.producer.disconnect();
      }

      for (const consumer of this.consumers.values()) {
        await consumer.disconnect();
      }

      logger.info('Disconnected from Kafka');
    } catch (error) {
      logger.error({ error: error.message }, 'Error disconnecting from Kafka');
    }
  }

  /**
   * Publish event to Kafka topic
   */
  async publishEvent(topic, eventType, data, partition = null) {
    if (!this.kafka || !this.producer) {
      logger.warn('Kafka is not configured, event not published');
      return false;
    }

    try {
      // Validate event schema
      if (this.eventSchemas.has(eventType)) {
        const isValid = this.validateEventSchema(eventType, data);
        if (!isValid) {
          throw new ValidationError(`Invalid event schema for ${eventType}`);
        }
      }

      const message = {
        topic,
        messages: [{
          key: data.tenantId || 'default',
          value: JSON.stringify({
            eventType,
            data,
            timestamp: new Date().toISOString(),
            version: this.eventSchemas.get(eventType)?.version || '1.0'
          }),
          partition
        }]
      };

      const result = await this.producer.send(message);
      
      logger.info({
        topic,
        eventType,
        partition: result[0].partition,
        offset: result[0].offset
      }, 'Event published to Kafka');

      return {
        success: true,
        partition: result[0].partition,
        offset: result[0].offset
      };

    } catch (error) {
      logger.error({
        error: error.message,
        topic,
        eventType
      }, 'Failed to publish event to Kafka');
      throw error;
    }
  }

  /**
   * Subscribe to Kafka topic
   */
  async subscribeToTopic(topic, groupId, handler) {
    if (!this.kafka) {
      throw new Error('Kafka is not configured');
    }

    try {
      const consumer = this.kafka.consumer({ groupId });
      await consumer.connect();
      await consumer.subscribe({ topic, fromBeginning: false });

      await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          try {
            const eventData = JSON.parse(message.value.toString());
            await handler(eventData, { topic, partition, offset: message.offset });
          } catch (error) {
            logger.error({
              error: error.message,
              topic,
              partition,
              offset: message.offset
            }, 'Error processing Kafka message');
          }
        }
      });

      this.consumers.set(`${topic}-${groupId}`, consumer);
      
      logger.info({
        topic,
        groupId
      }, 'Subscribed to Kafka topic');

      return consumer;

    } catch (error) {
      logger.error({
        error: error.message,
        topic,
        groupId
      }, 'Failed to subscribe to Kafka topic');
      throw error;
    }
  }

  /**
   * Create topic if it doesn't exist
   */
  async createTopic(topic, partitions = 3, replicationFactor = 1) {
    if (!this.kafka) {
      throw new Error('Kafka is not configured');
    }

    try {
      const admin = this.kafka.admin();
      await admin.connect();

      const topicExists = await admin.listTopics();
      if (!topicExists.includes(topic)) {
        await admin.createTopics({
          topics: [{
            topic,
            numPartitions: partitions,
            replicationFactor
          }]
        });

        logger.info({
          topic,
          partitions,
          replicationFactor
        }, 'Kafka topic created');
      }

      await admin.disconnect();
      return true;

    } catch (error) {
      logger.error({
        error: error.message,
        topic
      }, 'Failed to create Kafka topic');
      throw error;
    }
  }

  /**
   * Validate event schema
   */
  validateEventSchema(eventType, data) {
    const schema = this.eventSchemas.get(eventType);
    if (!schema) {
      return true; // No schema defined, allow all
    }

    // Basic validation - in production, use a proper JSON schema validator
    const requiredFields = schema.schema.required || [];
    
    for (const field of requiredFields) {
      if (!(field in data)) {
        logger.warn({
          eventType,
          missingField: field
        }, 'Required field missing in event data');
        return false;
      }
    }

    return true;
  }

  /**
   * Publish inventory events
   */
  async publishInventoryEvent(eventType, data) {
    return await this.publishEvent('inventory-events', eventType, data);
  }

  /**
   * Publish sales events
   */
  async publishSalesEvent(eventType, data) {
    return await this.publishEvent('sales-events', eventType, data);
  }

  /**
   * Publish purchase events
   */
  async publishPurchaseEvent(eventType, data) {
    return await this.publishEvent('purchase-events', eventType, data);
  }

  /**
   * Publish alert events
   */
  async publishAlertEvent(eventType, data) {
    return await this.publishEvent('alert-events', eventType, data);
  }

  /**
   * Publish user events
   */
  async publishUserEvent(eventType, data) {
    return await this.publishEvent('user-events', eventType, data);
  }

  /**
   * Publish analytics events
   */
  async publishAnalyticsEvent(eventType, data) {
    return await this.publishEvent('analytics-events', eventType, data);
  }

  /**
   * Get topic information
   */
  async getTopicInfo(topic) {
    if (!this.kafka) {
      throw new Error('Kafka is not configured');
    }

    try {
      const admin = this.kafka.admin();
      await admin.connect();

      const metadata = await admin.fetchTopicMetadata({ topics: [topic] });
      await admin.disconnect();

      return metadata.topics[0] || null;

    } catch (error) {
      logger.error({
        error: error.message,
        topic
      }, 'Failed to get topic information');
      throw error;
    }
  }

  /**
   * Get consumer group information
   */
  async getConsumerGroupInfo(groupId) {
    if (!this.kafka) {
      throw new Error('Kafka is not configured');
    }

    try {
      const admin = this.kafka.admin();
      await admin.connect();

      const groupInfo = await admin.describeGroups([groupId]);
      await admin.disconnect();

      return groupInfo.groups[0] || null;

    } catch (error) {
      logger.error({
        error: error.message,
        groupId
      }, 'Failed to get consumer group information');
      throw error;
    }
  }

  /**
   * Get Kafka cluster information
   */
  async getClusterInfo() {
    if (!this.kafka) {
      throw new Error('Kafka is not configured');
    }

    try {
      const admin = this.kafka.admin();
      await admin.connect();

      const clusterInfo = await admin.describeCluster();
      await admin.disconnect();

      return {
        clusterId: clusterInfo.clusterId,
        controller: clusterInfo.controller,
        brokers: clusterInfo.brokers
      };

    } catch (error) {
      logger.error({ error: error.message }, 'Failed to get cluster information');
      throw error;
    }
  }

  /**
   * Test Kafka connection
   */
  async testConnection() {
    if (!this.kafka) {
      return { status: 'error', message: 'Kafka is not configured' };
    }

    try {
      await this.connect();
      await this.disconnect();
      
      return { status: 'success', message: 'Kafka connection successful' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  /**
   * Get Kafka statistics
   */
  async getStatistics() {
    return {
      connected: !!this.producer,
      consumers: this.consumers.size,
      eventSchemas: this.eventSchemas.size,
      topics: Array.from(this.topics.keys()),
      status: this.kafka ? 'active' : 'disabled'
    };
  }
}

// Create singleton instance
const kafkaService = new KafkaService();

module.exports = {
  kafkaService,
  KafkaService
};
