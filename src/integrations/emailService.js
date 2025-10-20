/**
 * Email Service Integration
 * 
 * Comprehensive email service for notifications, alerts, reports, and communications
 * Supports multiple email providers with failover and retry mechanisms
 */

const nodemailer = require('nodemailer');
const { logger } = require('../config/logger');
const { ValidationError } = require('../core/exceptions');

class EmailService {
  constructor() {
    this.transporters = new Map();
    this.templates = new Map();
    this.initializeTransporters();
    this.initializeTemplates();
  }

  /**
   * Initialize email transporters for different providers
   */
  initializeTransporters() {
    // Primary SMTP transporter
    if (process.env.SMTP_HOST) {
      this.transporters.set('primary', nodemailer.createTransporter({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        },
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        rateDelta: 20000,
        rateLimit: 5
      }));
    }

    // Backup transporter (e.g., SendGrid)
    if (process.env.SENDGRID_API_KEY) {
      this.transporters.set('sendgrid', nodemailer.createTransporter({
        service: 'SendGrid',
        auth: {
          user: 'apikey',
          pass: process.env.SENDGRID_API_KEY
        }
      }));
    }

    // Gmail transporter
    if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
      this.transporters.set('gmail', nodemailer.createTransporter({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD
        }
      }));
    }
  }

  /**
   * Initialize email templates
   */
  initializeTemplates() {
    this.templates.set('low_stock_alert', {
      subject: 'Low Stock Alert - {{itemName}}',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #e74c3c;">Low Stock Alert</h2>
          <p>Dear {{recipientName}},</p>
          <p>The following item is running low in stock:</p>
          <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #e74c3c; margin: 20px 0;">
            <p><strong>Item:</strong> {{itemName}} ({{itemSku}})</p>
            <p><strong>Warehouse:</strong> {{warehouseName}}</p>
            <p><strong>Current Stock:</strong> {{currentStock}} {{unit}}</p>
            <p><strong>Reorder Point:</strong> {{reorderPoint}} {{unit}}</p>
          </div>
          <p>Please consider placing a purchase order to replenish stock.</p>
          <p>Best regards,<br>Smart Inventory ERP System</p>
        </div>
      `
    });

    this.templates.set('expiry_alert', {
      subject: 'Expiry Alert - {{itemName}}',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #f39c12;">Expiry Alert</h2>
          <p>Dear {{recipientName}},</p>
          <p>The following item is approaching its expiry date:</p>
          <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #f39c12; margin: 20px 0;">
            <p><strong>Item:</strong> {{itemName}} ({{itemSku}})</p>
            <p><strong>Warehouse:</strong> {{warehouseName}}</p>
            <p><strong>Expiry Date:</strong> {{expiryDate}}</p>
            <p><strong>Days Until Expiry:</strong> {{daysUntilExpiry}}</p>
            <p><strong>Current Stock:</strong> {{currentStock}} {{unit}}</p>
          </div>
          <p>Please take appropriate action to prevent waste.</p>
          <p>Best regards,<br>Smart Inventory ERP System</p>
        </div>
      `
    });

    this.templates.set('purchase_order_created', {
      subject: 'Purchase Order Created - {{poReference}}',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #27ae60;">Purchase Order Created</h2>
          <p>Dear {{recipientName}},</p>
          <p>A new purchase order has been created:</p>
          <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #27ae60; margin: 20px 0;">
            <p><strong>PO Reference:</strong> {{poReference}}</p>
            <p><strong>Supplier:</strong> {{supplierName}}</p>
            <p><strong>Total Amount:</strong> {{totalAmount}} {{currency}}</p>
            <p><strong>Expected Date:</strong> {{expectedDate}}</p>
            <p><strong>Status:</strong> {{status}}</p>
          </div>
          <p>Please review and approve the purchase order.</p>
          <p>Best regards,<br>Smart Inventory ERP System</p>
        </div>
      `
    });

    this.templates.set('sales_order_created', {
      subject: 'Sales Order Created - {{soReference}}',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #3498db;">Sales Order Created</h2>
          <p>Dear {{recipientName}},</p>
          <p>A new sales order has been created:</p>
          <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #3498db; margin: 20px 0;">
            <p><strong>SO Reference:</strong> {{soReference}}</p>
            <p><strong>Customer:</strong> {{customerName}}</p>
            <p><strong>Total Amount:</strong> {{totalAmount}} {{currency}}</p>
            <p><strong>Delivery Date:</strong> {{deliveryDate}}</p>
            <p><strong>Status:</strong> {{status}}</p>
          </div>
          <p>Please prepare the order for fulfillment.</p>
          <p>Best regards,<br>Smart Inventory ERP System</p>
        </div>
      `
    });

    this.templates.set('daily_report', {
      subject: 'Daily Inventory Report - {{date}}',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">Daily Inventory Report</h2>
          <p>Dear {{recipientName}},</p>
          <p>Here's your daily inventory summary for {{date}}:</p>
          <div style="background-color: #f8f9fa; padding: 15px; margin: 20px 0;">
            <h3>Summary</h3>
            <ul>
              <li><strong>Total Items:</strong> {{totalItems}}</li>
              <li><strong>Low Stock Items:</strong> {{lowStockItems}}</li>
              <li><strong>Expiring Items:</strong> {{expiringItems}}</li>
              <li><strong>New Orders:</strong> {{newOrders}}</li>
              <li><strong>Completed Orders:</strong> {{completedOrders}}</li>
            </ul>
          </div>
          <p>Best regards,<br>Smart Inventory ERP System</p>
        </div>
      `
    });

    this.templates.set('custom', {
      subject: '{{subject}}',
      html: '{{content}}'
    });
  }

  /**
   * Send email with template
   */
  async sendEmail({
    to,
    cc = [],
    bcc = [],
    template,
    data = {},
    attachments = [],
    priority = 'normal'
  }) {
    try {
      if (!to || (Array.isArray(to) && to.length === 0)) {
        throw new ValidationError('Recipient email is required');
      }

      if (!template || !this.templates.has(template)) {
        throw new ValidationError('Valid email template is required');
      }

      const templateData = this.templates.get(template);
      const subject = this.replacePlaceholders(templateData.subject, data);
      const html = this.replacePlaceholders(templateData.html, data);

      const mailOptions = {
        from: process.env.EMAIL_FROM || 'noreply@smartinventory.com',
        to: Array.isArray(to) ? to.join(', ') : to,
        cc: Array.isArray(cc) ? cc.join(', ') : cc,
        bcc: Array.isArray(bcc) ? bcc.join(', ') : bcc,
        subject,
        html,
        attachments,
        priority: priority === 'high' ? 'high' : 'normal'
      };

      // Try sending with different transporters
      let lastError;
      for (const [name, transporter] of this.transporters) {
        try {
          const result = await transporter.sendMail(mailOptions);
          logger.info({
            transporter: name,
            messageId: result.messageId,
            to: mailOptions.to
          }, 'Email sent successfully');
          
          return {
            success: true,
            messageId: result.messageId,
            transporter: name
          };
        } catch (error) {
          lastError = error;
          logger.warn({
            transporter: name,
            error: error.message
          }, 'Failed to send email with transporter');
        }
      }

      throw lastError || new Error('No email transporters available');

    } catch (error) {
      logger.error({
        error: error.message,
        to,
        template
      }, 'Failed to send email');
      throw error;
    }
  }

  /**
   * Send bulk emails
   */
  async sendBulkEmails(emails) {
    const results = [];
    const batchSize = 10; // Process in batches to avoid overwhelming the service

    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      const batchPromises = batch.map(email => this.sendEmail(email));
      
      try {
        const batchResults = await Promise.allSettled(batchPromises);
        results.push(...batchResults);
        
        // Add delay between batches
        if (i + batchSize < emails.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        logger.error({ error: error.message }, 'Batch email sending failed');
      }
    }

    return results;
  }

  /**
   * Send notification emails for alerts
   */
  async sendAlertNotification(alert, recipients) {
    const template = this.getAlertTemplate(alert.type);
    const data = this.formatAlertData(alert);

    const emails = recipients.map(recipient => ({
      to: recipient.email,
      template,
      data: { ...data, recipientName: recipient.name }
    }));

    return await this.sendBulkEmails(emails);
  }

  /**
   * Send daily reports
   */
  async sendDailyReport(tenantId, reportData, recipients) {
    const emails = recipients.map(recipient => ({
      to: recipient.email,
      template: 'daily_report',
      data: {
        ...reportData,
        recipientName: recipient.name,
        date: new Date().toLocaleDateString()
      }
    }));

    return await this.sendBulkEmails(emails);
  }

  /**
   * Send order notifications
   */
  async sendOrderNotification(order, orderType, recipients) {
    const template = orderType === 'purchase' ? 'purchase_order_created' : 'sales_order_created';
    const data = this.formatOrderData(order, orderType);

    const emails = recipients.map(recipient => ({
      to: recipient.email,
      template,
      data: { ...data, recipientName: recipient.name }
    }));

    return await this.sendBulkEmails(emails);
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
   * Get appropriate template for alert type
   */
  getAlertTemplate(alertType) {
    const templateMap = {
      'LOW_STOCK': 'low_stock_alert',
      'EXPIRY': 'expiry_alert',
      'OVERSTOCK': 'low_stock_alert', // Reuse template
      'REORDER': 'low_stock_alert' // Reuse template
    };

    return templateMap[alertType] || 'custom';
  }

  /**
   * Format alert data for template
   */
  formatAlertData(alert) {
    return {
      itemName: alert.item?.name || 'Unknown Item',
      itemSku: alert.item?.sku || 'N/A',
      warehouseName: alert.warehouse?.name || 'Unknown Warehouse',
      currentStock: alert.currentStock || 'N/A',
      reorderPoint: alert.reorderPoint || 'N/A',
      unit: alert.item?.unit || 'units',
      expiryDate: alert.expiryDate ? new Date(alert.expiryDate).toLocaleDateString() : 'N/A',
      daysUntilExpiry: alert.daysUntilExpiry || 'N/A'
    };
  }

  /**
   * Format order data for template
   */
  formatOrderData(order, orderType) {
    return {
      poReference: order.reference || order.id,
      soReference: order.reference || order.id,
      supplierName: order.supplier?.name || 'Unknown Supplier',
      customerName: order.customer || 'Unknown Customer',
      totalAmount: order.totalAmount || '0.00',
      currency: order.currency || 'USD',
      expectedDate: order.expectedDate ? new Date(order.expectedDate).toLocaleDateString() : 'N/A',
      deliveryDate: order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString() : 'N/A',
      status: order.status || 'PENDING'
    };
  }

  /**
   * Test email configuration
   */
  async testConfiguration() {
    const results = {};

    for (const [name, transporter] of this.transporters) {
      try {
        await transporter.verify();
        results[name] = { status: 'success', message: 'Configuration valid' };
      } catch (error) {
        results[name] = { status: 'error', message: error.message };
      }
    }

    return results;
  }

  /**
   * Get email statistics
   */
  async getStatistics() {
    return {
      transporters: Array.from(this.transporters.keys()),
      templates: Array.from(this.templates.keys()),
      status: 'active'
    };
  }
}

// Create singleton instance
const emailService = new EmailService();

module.exports = {
  emailService,
  EmailService
};
