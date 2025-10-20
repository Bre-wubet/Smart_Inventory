/**
 * SMS Service Integration
 * 
 * Comprehensive SMS service for critical alerts, notifications, and communications
 * Supports multiple SMS providers with failover and retry mechanisms
 */

const { logger } = require('../config/logger');
const { ValidationError } = require('../core/exceptions');

class SMSService {
  constructor() {
    this.providers = new Map();
    this.templates = new Map();
    this.initializeProviders();
    this.initializeTemplates();
  }

  /**
   * Initialize SMS providers
   */
  initializeProviders() {
    // Twilio provider
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      this.providers.set('twilio', {
        name: 'Twilio',
        send: async (to, message) => {
          const twilio = require('twilio');
          const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
          
          const result = await client.messages.create({
            body: message,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: to
          });
          
          return {
            success: true,
            messageId: result.sid,
            status: result.status
          };
        }
      });
    }

    // AWS SNS provider
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      this.providers.set('aws-sns', {
        name: 'AWS SNS',
        send: async (to, message) => {
          const AWS = require('aws-sdk');
          const sns = new AWS.SNS({
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            region: process.env.AWS_REGION || 'us-east-1'
          });

          const result = await sns.publish({
            Message: message,
            PhoneNumber: to
          }).promise();

          return {
            success: true,
            messageId: result.MessageId,
            status: 'sent'
          };
        }
      });
    }

    // TextLocal provider
    if (process.env.TEXTLOCAL_API_KEY) {
      this.providers.set('textlocal', {
        name: 'TextLocal',
        send: async (to, message) => {
          const https = require('https');
          const querystring = require('querystring');

          const postData = querystring.stringify({
            apikey: process.env.TEXTLOCAL_API_KEY,
            numbers: to,
            message: message,
            sender: process.env.TEXTLOCAL_SENDER || 'TXTLCL'
          });

          const options = {
            hostname: 'api.textlocal.in',
            port: 443,
            path: '/send/',
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Content-Length': Buffer.byteLength(postData)
            }
          };

          return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
              let data = '';
              res.on('data', (chunk) => data += chunk);
              res.on('end', () => {
                const result = JSON.parse(data);
                if (result.status === 'success') {
                  resolve({
                    success: true,
                    messageId: result.batch_id,
                    status: 'sent'
                  });
                } else {
                  reject(new Error(result.errors[0]?.message || 'SMS sending failed'));
                }
              });
            });

            req.on('error', reject);
            req.write(postData);
            req.end();
          });
        }
      });
    }

    // Nexmo/Vonage provider
    if (process.env.NEXMO_API_KEY && process.env.NEXMO_API_SECRET) {
      this.providers.set('nexmo', {
        name: 'Nexmo/Vonage',
        send: async (to, message) => {
          const Nexmo = require('nexmo');
          const nexmo = new Nexmo({
            apiKey: process.env.NEXMO_API_KEY,
            apiSecret: process.env.NEXMO_API_SECRET
          });

          return new Promise((resolve, reject) => {
            nexmo.message.sendSms(
              process.env.NEXMO_FROM || 'SmartInventory',
              to,
              message,
              (err, responseData) => {
                if (err) {
                  reject(err);
                } else {
                  resolve({
                    success: true,
                    messageId: responseData.messages[0]['message-id'],
                    status: responseData.messages[0].status
                  });
                }
              }
            );
          });
        }
      });
    }
  }

  /**
   * Initialize SMS templates
   */
  initializeTemplates() {
    this.templates.set('low_stock_alert', {
      message: 'ALERT: {{itemName}} is running low in {{warehouseName}}. Current stock: {{currentStock}} {{unit}}. Please reorder soon.',
      priority: 'high'
    });

    this.templates.set('expiry_alert', {
      message: 'ALERT: {{itemName}} expires in {{daysUntilExpiry}} days in {{warehouseName}}. Current stock: {{currentStock}} {{unit}}.',
      priority: 'high'
    });

    this.templates.set('critical_alert', {
      message: 'CRITICAL: {{alertType}} - {{message}}',
      priority: 'critical'
    });

    this.templates.set('order_confirmation', {
      message: 'Order {{orderReference}} has been {{status}}. Total: {{totalAmount}} {{currency}}.',
      priority: 'normal'
    });

    this.templates.set('delivery_notification', {
      message: 'Delivery scheduled for {{deliveryDate}} for order {{orderReference}}. Please prepare for receipt.',
      priority: 'normal'
    });

    this.templates.set('payment_reminder', {
      message: 'Payment reminder: Invoice {{invoiceNumber}} for {{amount}} {{currency}} is due on {{dueDate}}.',
      priority: 'normal'
    });

    this.templates.set('system_maintenance', {
      message: 'System maintenance scheduled for {{maintenanceDate}} from {{startTime}} to {{endTime}}. System may be unavailable.',
      priority: 'normal'
    });

    this.templates.set('custom', {
      message: '{{message}}',
      priority: 'normal'
    });
  }

  /**
   * Send SMS message
   */
  async sendSMS({
    to,
    template,
    data = {},
    priority = 'normal',
    provider = null
  }) {
    try {
      if (!to) {
        throw new ValidationError('Recipient phone number is required');
      }

      if (!template || !this.templates.has(template)) {
        throw new ValidationError('Valid SMS template is required');
      }

      const templateData = this.templates.get(template);
      const message = this.replacePlaceholders(templateData.message, data);

      // Validate phone number format
      const formattedNumber = this.formatPhoneNumber(to);
      if (!formattedNumber) {
        throw new ValidationError('Invalid phone number format');
      }

      // Select provider based on priority and availability
      const selectedProvider = provider || this.selectProvider(priority);

      if (!selectedProvider) {
        throw new Error('No SMS providers available');
      }

      const result = await selectedProvider.send(formattedNumber, message);
      
      logger.info({
        provider: selectedProvider.name,
        to: formattedNumber,
        messageId: result.messageId,
        priority
      }, 'SMS sent successfully');

      return {
        success: true,
        messageId: result.messageId,
        provider: selectedProvider.name,
        status: result.status
      };

    } catch (error) {
      logger.error({
        error: error.message,
        to,
        template,
        priority
      }, 'Failed to send SMS');
      throw error;
    }
  }

  /**
   * Send bulk SMS messages
   */
  async sendBulkSMS(messages) {
    const results = [];
    const batchSize = 5; // Process in smaller batches for SMS

    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      const batchPromises = batch.map(sms => this.sendSMS(sms));
      
      try {
        const batchResults = await Promise.allSettled(batchPromises);
        results.push(...batchResults);
        
        // Add delay between batches to respect rate limits
        if (i + batchSize < messages.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        logger.error({ error: error.message }, 'Batch SMS sending failed');
      }
    }

    return results;
  }

  /**
   * Send alert notifications via SMS
   */
  async sendAlertNotification(alert, recipients) {
    const template = this.getAlertTemplate(alert.type);
    const data = this.formatAlertData(alert);

    const messages = recipients
      .filter(recipient => recipient.phone && recipient.smsEnabled)
      .map(recipient => ({
        to: recipient.phone,
        template,
        data: { ...data, recipientName: recipient.name },
        priority: template.priority
      }));

    return await this.sendBulkSMS(messages);
  }

  /**
   * Send critical alerts immediately
   */
  async sendCriticalAlert(alertType, message, recipients) {
    const messages = recipients
      .filter(recipient => recipient.phone && recipient.smsEnabled)
      .map(recipient => ({
        to: recipient.phone,
        template: 'critical_alert',
        data: { alertType, message, recipientName: recipient.name },
        priority: 'critical'
      }));

    return await this.sendBulkSMS(messages);
  }

  /**
   * Send order notifications
   */
  async sendOrderNotification(order, orderType, recipients) {
    const template = orderType === 'purchase' ? 'order_confirmation' : 'order_confirmation';
    const data = this.formatOrderData(order, orderType);

    const messages = recipients
      .filter(recipient => recipient.phone && recipient.smsEnabled)
      .map(recipient => ({
        to: recipient.phone,
        template,
        data: { ...data, recipientName: recipient.name },
        priority: 'normal'
      }));

    return await this.sendBulkSMS(messages);
  }

  /**
   * Send delivery notifications
   */
  async sendDeliveryNotification(order, recipients) {
    const data = this.formatDeliveryData(order);

    const messages = recipients
      .filter(recipient => recipient.phone && recipient.smsEnabled)
      .map(recipient => ({
        to: recipient.phone,
        template: 'delivery_notification',
        data: { ...data, recipientName: recipient.name },
        priority: 'normal'
      }));

    return await this.sendBulkSMS(messages);
  }

  /**
   * Send payment reminders
   */
  async sendPaymentReminder(invoice, recipients) {
    const data = this.formatPaymentData(invoice);

    const messages = recipients
      .filter(recipient => recipient.phone && recipient.smsEnabled)
      .map(recipient => ({
        to: recipient.phone,
        template: 'payment_reminder',
        data: { ...data, recipientName: recipient.name },
        priority: 'normal'
      }));

    return await this.sendBulkSMS(messages);
  }

  /**
   * Replace placeholders in template
   */
  replacePlaceholders(template, data) {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] || match;
    });
  }

  /**
   * Format phone number to international format
   */
  formatPhoneNumber(phoneNumber) {
    // Remove all non-digit characters
    const cleaned = phoneNumber.replace(/\D/g, '');
    
    // Add country code if not present (assuming US if not specified)
    if (cleaned.length === 10) {
      return `+1${cleaned}`;
    } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+${cleaned}`;
    } else if (cleaned.length > 11) {
      return `+${cleaned}`;
    }
    
    return null;
  }

  /**
   * Select appropriate provider based on priority
   */
  selectProvider(priority) {
    const providers = Array.from(this.providers.values());
    
    if (providers.length === 0) {
      return null;
    }

    // For critical messages, prefer more reliable providers
    if (priority === 'critical') {
      const reliableProviders = ['twilio', 'aws-sns'];
      const reliable = providers.find(p => reliableProviders.includes(p.name.toLowerCase()));
      return reliable || providers[0];
    }

    // For normal messages, use round-robin or first available
    return providers[0];
  }

  /**
   * Get appropriate template for alert type
   */
  getAlertTemplate(alertType) {
    const templateMap = {
      'LOW_STOCK': 'low_stock_alert',
      'EXPIRY': 'expiry_alert',
      'OVERSTOCK': 'low_stock_alert',
      'REORDER': 'low_stock_alert',
      'CRITICAL': 'critical_alert'
    };

    return templateMap[alertType] || 'custom';
  }

  /**
   * Format alert data for template
   */
  formatAlertData(alert) {
    return {
      itemName: alert.item?.name || 'Unknown Item',
      warehouseName: alert.warehouse?.name || 'Unknown Warehouse',
      currentStock: alert.currentStock || 'N/A',
      unit: alert.item?.unit || 'units',
      daysUntilExpiry: alert.daysUntilExpiry || 'N/A',
      alertType: alert.type || 'ALERT'
    };
  }

  /**
   * Format order data for template
   */
  formatOrderData(order, orderType) {
    return {
      orderReference: order.reference || order.id,
      status: order.status || 'PENDING',
      totalAmount: order.totalAmount || '0.00',
      currency: order.currency || 'USD'
    };
  }

  /**
   * Format delivery data for template
   */
  formatDeliveryData(order) {
    return {
      orderReference: order.reference || order.id,
      deliveryDate: order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString() : 'TBD'
    };
  }

  /**
   * Format payment data for template
   */
  formatPaymentData(invoice) {
    return {
      invoiceNumber: invoice.number || invoice.id,
      amount: invoice.amount || '0.00',
      currency: invoice.currency || 'USD',
      dueDate: invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'TBD'
    };
  }

  /**
   * Test SMS configuration
   */
  async testConfiguration(testNumber) {
    const results = {};

    for (const [name, provider] of this.providers) {
      try {
        const result = await provider.send(testNumber, 'Test message from Smart Inventory ERP');
        results[name] = { 
          status: 'success', 
          message: 'Configuration valid',
          messageId: result.messageId
        };
      } catch (error) {
        results[name] = { 
          status: 'error', 
          message: error.message 
        };
      }
    }

    return results;
  }

  /**
   * Get SMS statistics
   */
  async getStatistics() {
    return {
      providers: Array.from(this.providers.keys()),
      templates: Array.from(this.templates.keys()),
      status: 'active'
    };
  }
}

// Create singleton instance
const smsService = new SMSService();

module.exports = {
  smsService,
  SMSService
};
