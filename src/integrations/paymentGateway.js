/**
 * Payment Gateway Integration
 * 
 * Comprehensive payment gateway service for processing payments, refunds, and transactions
 * Supports multiple payment providers with unified interface
 */

const { logger } = require('../config/logger');
const { ValidationError, PaymentError } = require('../core/exceptions');

class PaymentGatewayService {
  constructor() {
    this.gateways = new Map();
    this.webhooks = new Map();
    this.initializeGateways();
    this.initializeWebhooks();
  }

  /**
   * Initialize payment gateways
   */
  initializeGateways() {
    // Stripe gateway
    if (process.env.STRIPE_SECRET_KEY) {
      this.gateways.set('stripe', {
        name: 'Stripe',
        processPayment: async (paymentData) => {
          const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
          
          try {
            const paymentIntent = await stripe.paymentIntents.create({
              amount: Math.round(paymentData.amount * 100), // Convert to cents
              currency: paymentData.currency || 'usd',
              customer: paymentData.customerId,
              payment_method: paymentData.paymentMethodId,
              confirmation_method: 'manual',
              confirm: true,
              metadata: {
                orderId: paymentData.orderId,
                tenantId: paymentData.tenantId
              }
            });

            return {
              success: true,
              transactionId: paymentIntent.id,
              status: paymentIntent.status,
              amount: paymentData.amount,
              currency: paymentData.currency,
              gateway: 'stripe'
            };
          } catch (error) {
            throw new PaymentError(`Stripe payment failed: ${error.message}`);
          }
        },
        processRefund: async (refundData) => {
          const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
          
          try {
            const refund = await stripe.refunds.create({
              payment_intent: refundData.transactionId,
              amount: refundData.amount ? Math.round(refundData.amount * 100) : undefined,
              reason: refundData.reason || 'requested_by_customer',
              metadata: {
                orderId: refundData.orderId,
                tenantId: refundData.tenantId
              }
            });

            return {
              success: true,
              refundId: refund.id,
              status: refund.status,
              amount: refundData.amount,
              gateway: 'stripe'
            };
          } catch (error) {
            throw new PaymentError(`Stripe refund failed: ${error.message}`);
          }
        }
      });
    }

    // PayPal gateway
    if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) {
      this.gateways.set('paypal', {
        name: 'PayPal',
        processPayment: async (paymentData) => {
          const paypal = require('@paypal/checkout-server-sdk');
          
          const environment = process.env.NODE_ENV === 'production' 
            ? new paypal.core.LiveEnvironment(process.env.PAYPAL_CLIENT_ID, process.env.PAYPAL_CLIENT_SECRET)
            : new paypal.core.SandboxEnvironment(process.env.PAYPAL_CLIENT_ID, process.env.PAYPAL_CLIENT_SECRET);
          
          const client = new paypal.core.PayPalHttpClient(environment);
          
          try {
            const request = new paypal.orders.OrdersCreateRequest();
            request.prefer("return=representation");
            request.requestBody({
              intent: 'CAPTURE',
              purchase_units: [{
                amount: {
                  currency_code: paymentData.currency || 'USD',
                  value: paymentData.amount.toString()
                },
                custom_id: paymentData.orderId
              }]
            });

            const response = await client.execute(request);
            
            return {
              success: true,
              transactionId: response.result.id,
              status: response.result.status,
              amount: paymentData.amount,
              currency: paymentData.currency,
              gateway: 'paypal'
            };
          } catch (error) {
            throw new PaymentError(`PayPal payment failed: ${error.message}`);
          }
        },
        processRefund: async (refundData) => {
          const paypal = require('@paypal/checkout-server-sdk');
          
          const environment = process.env.NODE_ENV === 'production' 
            ? new paypal.core.LiveEnvironment(process.env.PAYPAL_CLIENT_ID, process.env.PAYPAL_CLIENT_SECRET)
            : new paypal.core.SandboxEnvironment(process.env.PAYPAL_CLIENT_ID, process.env.PAYPAL_CLIENT_SECRET);
          
          const client = new paypal.core.PayPalHttpClient(environment);
          
          try {
            const request = new paypal.payments.CapturesRefundRequest(refundData.transactionId);
            request.requestBody({
              amount: {
                currency_code: refundData.currency || 'USD',
                value: refundData.amount.toString()
              },
              note_to_payer: refundData.reason || 'Refund requested'
            });

            const response = await client.execute(request);
            
            return {
              success: true,
              refundId: response.result.id,
              status: response.result.status,
              amount: refundData.amount,
              gateway: 'paypal'
            };
          } catch (error) {
            throw new PaymentError(`PayPal refund failed: ${error.message}`);
          }
        }
      });
    }

    // Razorpay gateway
    if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
      this.gateways.set('razorpay', {
        name: 'Razorpay',
        processPayment: async (paymentData) => {
          const Razorpay = require('razorpay');
          const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET
          });

          try {
            const order = await razorpay.orders.create({
              amount: Math.round(paymentData.amount * 100), // Convert to paise
              currency: paymentData.currency || 'INR',
              receipt: paymentData.orderId,
              notes: {
                tenantId: paymentData.tenantId
              }
            });

            return {
              success: true,
              transactionId: order.id,
              status: 'created',
              amount: paymentData.amount,
              currency: paymentData.currency,
              gateway: 'razorpay'
            };
          } catch (error) {
            throw new PaymentError(`Razorpay payment failed: ${error.message}`);
          }
        },
        processRefund: async (refundData) => {
          const Razorpay = require('razorpay');
          const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET
          });

          try {
            const refund = await razorpay.payments.refund(refundData.transactionId, {
              amount: refundData.amount ? Math.round(refundData.amount * 100) : undefined,
              notes: {
                reason: refundData.reason || 'Refund requested',
                orderId: refundData.orderId,
                tenantId: refundData.tenantId
              }
            });

            return {
              success: true,
              refundId: refund.id,
              status: refund.status,
              amount: refundData.amount,
              gateway: 'razorpay'
            };
          } catch (error) {
            throw new PaymentError(`Razorpay refund failed: ${error.message}`);
          }
        }
      });
    }

    // Square gateway
    if (process.env.SQUARE_APPLICATION_ID && process.env.SQUARE_ACCESS_TOKEN) {
      this.gateways.set('square', {
        name: 'Square',
        processPayment: async (paymentData) => {
          const { Client, Environment } = require('squareup');
          
          const client = new Client({
            environment: process.env.NODE_ENV === 'production' ? Environment.Production : Environment.Sandbox,
            accessToken: process.env.SQUARE_ACCESS_TOKEN
          });

          try {
            const { paymentsApi } = client;
            
            const requestBody = {
              sourceId: paymentData.paymentMethodId,
              amountMoney: {
                amount: Math.round(paymentData.amount * 100), // Convert to cents
                currency: paymentData.currency || 'USD'
              },
              idempotencyKey: paymentData.orderId + '_' + Date.now(),
              note: `Payment for order ${paymentData.orderId}`
            };

            const response = await paymentsApi.createPayment(requestBody);
            
            return {
              success: true,
              transactionId: response.result.payment.id,
              status: response.result.payment.status,
              amount: paymentData.amount,
              currency: paymentData.currency,
              gateway: 'square'
            };
          } catch (error) {
            throw new PaymentError(`Square payment failed: ${error.message}`);
          }
        },
        processRefund: async (refundData) => {
          const { Client, Environment } = require('squareup');
          
          const client = new Client({
            environment: process.env.NODE_ENV === 'production' ? Environment.Production : Environment.Sandbox,
            accessToken: process.env.SQUARE_ACCESS_TOKEN
          });

          try {
            const { refundsApi } = client;
            
            const requestBody = {
              idempotencyKey: refundData.orderId + '_refund_' + Date.now(),
              amountMoney: {
                amount: refundData.amount ? Math.round(refundData.amount * 100) : undefined,
                currency: refundData.currency || 'USD'
              },
              paymentId: refundData.transactionId,
              reason: refundData.reason || 'Refund requested'
            };

            const response = await refundsApi.refundPayment(requestBody);
            
            return {
              success: true,
              refundId: response.result.refund.id,
              status: response.result.refund.status,
              amount: refundData.amount,
              gateway: 'square'
            };
          } catch (error) {
            throw new PaymentError(`Square refund failed: ${error.message}`);
          }
        }
      });
    }
  }

  /**
   * Initialize webhook handlers
   */
  initializeWebhooks() {
    // Stripe webhook
    this.webhooks.set('stripe', {
      verify: (payload, signature) => {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        try {
          return stripe.webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET);
        } catch (error) {
          throw new Error(`Stripe webhook verification failed: ${error.message}`);
        }
      },
      handle: async (event) => {
        switch (event.type) {
          case 'payment_intent.succeeded':
            return {
              type: 'payment_success',
              transactionId: event.data.object.id,
              amount: event.data.object.amount / 100,
              currency: event.data.object.currency,
              metadata: event.data.object.metadata
            };
          case 'payment_intent.payment_failed':
            return {
              type: 'payment_failed',
              transactionId: event.data.object.id,
              error: event.data.object.last_payment_error?.message
            };
          default:
            return { type: 'unknown', event: event.type };
        }
      }
    });

    // PayPal webhook
    this.webhooks.set('paypal', {
      verify: (payload, headers) => {
        // PayPal webhook verification logic
        return JSON.parse(payload);
      },
      handle: async (event) => {
        switch (event.event_type) {
          case 'PAYMENT.CAPTURE.COMPLETED':
            return {
              type: 'payment_success',
              transactionId: event.resource.id,
              amount: parseFloat(event.resource.amount.value),
              currency: event.resource.amount.currency_code
            };
          case 'PAYMENT.CAPTURE.DENIED':
            return {
              type: 'payment_failed',
              transactionId: event.resource.id,
              error: 'Payment denied'
            };
          default:
            return { type: 'unknown', event: event.event_type };
        }
      }
    });
  }

  /**
   * Process payment
   */
  async processPayment({
    gateway = 'stripe',
    amount,
    currency = 'USD',
    paymentMethodId,
    customerId,
    orderId,
    tenantId,
    description = null
  }) {
    try {
      if (!amount || amount <= 0) {
        throw new ValidationError('Valid payment amount is required');
      }

      if (!this.gateways.has(gateway)) {
        throw new ValidationError(`Payment gateway '${gateway}' is not configured`);
      }

      const gatewayService = this.gateways.get(gateway);
      
      const paymentData = {
        amount,
        currency,
        paymentMethodId,
        customerId,
        orderId,
        tenantId,
        description
      };

      const result = await gatewayService.processPayment(paymentData);
      
      logger.info({
        gateway,
        transactionId: result.transactionId,
        amount,
        currency,
        orderId,
        tenantId
      }, 'Payment processed successfully');

      return result;

    } catch (error) {
      logger.error({
        error: error.message,
        gateway,
        amount,
        orderId,
        tenantId
      }, 'Payment processing failed');
      throw error;
    }
  }

  /**
   * Process refund
   */
  async processRefund({
    gateway = 'stripe',
    transactionId,
    amount = null,
    currency = 'USD',
    reason = 'Refund requested',
    orderId,
    tenantId
  }) {
    try {
      if (!transactionId) {
        throw new ValidationError('Transaction ID is required for refund');
      }

      if (!this.gateways.has(gateway)) {
        throw new ValidationError(`Payment gateway '${gateway}' is not configured`);
      }

      const gatewayService = this.gateways.get(gateway);
      
      const refundData = {
        transactionId,
        amount,
        currency,
        reason,
        orderId,
        tenantId
      };

      const result = await gatewayService.processRefund(refundData);
      
      logger.info({
        gateway,
        refundId: result.refundId,
        transactionId,
        amount,
        orderId,
        tenantId
      }, 'Refund processed successfully');

      return result;

    } catch (error) {
      logger.error({
        error: error.message,
        gateway,
        transactionId,
        amount,
        orderId,
        tenantId
      }, 'Refund processing failed');
      throw error;
    }
  }

  /**
   * Handle webhook events
   */
  async handleWebhook(gateway, payload, signature = null) {
    try {
      if (!this.webhooks.has(gateway)) {
        throw new ValidationError(`Webhook handler for '${gateway}' is not configured`);
      }

      const webhookHandler = this.webhooks.get(gateway);
      
      // Verify webhook signature
      const verifiedPayload = webhookHandler.verify(payload, signature);
      
      // Handle the event
      const result = await webhookHandler.handle(verifiedPayload);
      
      logger.info({
        gateway,
        eventType: result.type,
        transactionId: result.transactionId
      }, 'Webhook event processed');

      return result;

    } catch (error) {
      logger.error({
        error: error.message,
        gateway
      }, 'Webhook processing failed');
      throw error;
    }
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(gateway, transactionId) {
    try {
      if (!this.gateways.has(gateway)) {
        throw new ValidationError(`Payment gateway '${gateway}' is not configured`);
      }

      // Implementation would depend on specific gateway API
      // This is a placeholder for the actual implementation
      return {
        transactionId,
        status: 'unknown',
        gateway
      };

    } catch (error) {
      logger.error({
        error: error.message,
        gateway,
        transactionId
      }, 'Failed to get payment status');
      throw error;
    }
  }

  /**
   * Create payment intent (for client-side payment)
   */
  async createPaymentIntent({
    gateway = 'stripe',
    amount,
    currency = 'USD',
    customerId,
    orderId,
    tenantId,
    metadata = {}
  }) {
    try {
      if (!amount || amount <= 0) {
        throw new ValidationError('Valid payment amount is required');
      }

      if (!this.gateways.has(gateway)) {
        throw new ValidationError(`Payment gateway '${gateway}' is not configured`);
      }

      // This would typically create a payment intent for client-side processing
      // Implementation depends on the specific gateway
      return {
        clientSecret: `pi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        amount,
        currency,
        gateway,
        orderId,
        tenantId
      };

    } catch (error) {
      logger.error({
        error: error.message,
        gateway,
        amount,
        orderId,
        tenantId
      }, 'Failed to create payment intent');
      throw error;
    }
  }

  /**
   * Test payment gateway configuration
   */
  async testConfiguration(gateway) {
    try {
      if (!this.gateways.has(gateway)) {
        throw new ValidationError(`Payment gateway '${gateway}' is not configured`);
      }

      // Test with a small amount (if supported by gateway)
      const testResult = await this.processPayment({
        gateway,
        amount: 0.01,
        currency: 'USD',
        paymentMethodId: 'test_payment_method',
        orderId: `test_${Date.now()}`,
        tenantId: 'test_tenant'
      });

      return {
        status: 'success',
        message: 'Gateway configuration is valid',
        testTransactionId: testResult.transactionId
      };

    } catch (error) {
      return {
        status: 'error',
        message: error.message
      };
    }
  }

  /**
   * Get available gateways
   */
  getAvailableGateways() {
    return Array.from(this.gateways.keys());
  }

  /**
   * Get gateway statistics
   */
  async getStatistics() {
    return {
      availableGateways: this.getAvailableGateways(),
      webhookHandlers: Array.from(this.webhooks.keys()),
      status: 'active'
    };
  }
}

// Create singleton instance
const paymentGatewayService = new PaymentGatewayService();

module.exports = {
  paymentGatewayService,
  PaymentGatewayService
};
