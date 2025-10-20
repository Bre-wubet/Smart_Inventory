# Smart Inventory ERP - Integration Services API Documentation

## Overview

The Smart Inventory ERP system includes comprehensive integration services that provide unified access to external services, communication channels, payment gateways, file storage, and messaging systems. This document outlines all available integration endpoints and their usage.

## Base URL

```
/api/integrations
```

## Authentication

All integration endpoints require authentication and tenant access:

- **Authentication**: Bearer token required
- **Tenant Access**: Tenant ID must be provided in request headers

## Integration Services

### 1. Email Service Integration

**Purpose**: Send emails for notifications, alerts, reports, and communications

**Supported Providers**:
- SMTP (Primary)
- SendGrid (Backup)
- Gmail (Backup)

**Features**:
- Multiple email templates
- Bulk email sending
- Failover between providers
- Rate limiting and retry mechanisms

### 2. SMS Service Integration

**Purpose**: Send SMS messages for critical alerts and notifications

**Supported Providers**:
- Twilio (Primary)
- AWS SNS (Backup)
- TextLocal (Backup)
- Nexmo/Vonage (Backup)

**Features**:
- Multiple SMS templates
- Bulk SMS sending
- International phone number formatting
- Priority-based provider selection

### 3. Payment Gateway Integration

**Purpose**: Process payments, refunds, and transactions

**Supported Providers**:
- Stripe (Primary)
- PayPal (Backup)
- Razorpay (Backup)
- Square (Backup)

**Features**:
- Multiple payment methods
- Webhook handling
- Refund processing
- Payment status tracking

### 4. Kafka Integration

**Purpose**: Event streaming and real-time updates

**Features**:
- Event publishing
- Topic subscription
- Event schema validation
- Consumer group management

### 5. File Storage Integration

**Purpose**: Document management and file uploads

**Supported Providers**:
- AWS S3 (Primary)
- Google Cloud Storage (Backup)
- Azure Blob Storage (Backup)
- Local File System (Fallback)

**Features**:
- Multiple file type support
- File validation
- Metadata management
- Cloud storage integration

### 6. External API Integration

**Purpose**: Integrate with external services and APIs

**Supported APIs**:
- Supplier APIs
- Customer APIs
- Shipping APIs
- Accounting APIs
- Inventory APIs

**Features**:
- Data synchronization
- Rate limiting
- Error handling
- Scheduled sync jobs

## API Endpoints

### Status and Health Monitoring

#### Get Integration Status
```http
GET /integrations/status
```

**Response**:
```json
{
  "success": true,
  "data": {
    "total": 6,
    "healthy": 5,
    "unhealthy": 1,
    "error": 0,
    "services": {
      "email": {
        "status": "healthy",
        "name": "Email Service",
        "type": "communication"
      },
      "sms": {
        "status": "healthy",
        "name": "SMS Service",
        "type": "communication"
      },
      "payment": {
        "status": "unhealthy",
        "name": "Payment Gateway",
        "type": "payment"
      }
    }
  }
}
```

#### Check Service Health
```http
GET /integrations/health/:serviceName
```

**Parameters**:
- `serviceName` (string): Name of the service to check

**Response**:
```json
{
  "success": true,
  "data": {
    "serviceName": "email",
    "status": "healthy",
    "details": {
      "primary": {
        "status": "success",
        "message": "Configuration valid"
      },
      "sendgrid": {
        "status": "success",
        "message": "Configuration valid"
      }
    }
  }
}
```

#### Check All Services Health
```http
GET /integrations/health
```

**Response**:
```json
{
  "success": true,
  "data": {
    "email": {
      "status": "healthy",
      "details": { ... }
    },
    "sms": {
      "status": "healthy",
      "details": { ... }
    },
    "payment": {
      "status": "unhealthy",
      "error": "Stripe API key not configured"
    }
  }
}
```

### Service Management

#### Get Service Information
```http
GET /integrations/services/:serviceName
```

**Parameters**:
- `serviceName` (string): Name of the service

**Response**:
```json
{
  "success": true,
  "data": {
    "name": "Email Service",
    "type": "communication",
    "status": "active",
    "dependencies": ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"]
  }
}
```

#### Get Integration Metrics
```http
GET /integrations/metrics
```

**Response**:
```json
{
  "success": true,
  "data": {
    "email": {
      "transporters": ["primary", "sendgrid", "gmail"],
      "templates": ["low_stock_alert", "expiry_alert", "daily_report"],
      "status": "active"
    },
    "sms": {
      "providers": ["twilio", "aws-sns", "textlocal"],
      "templates": ["low_stock_alert", "critical_alert"],
      "status": "active"
    }
  }
}
```

#### Initialize All Services
```http
POST /integrations/initialize
```

**Response**:
```json
{
  "success": true,
  "data": {
    "email": { "status": "initialized" },
    "sms": { "status": "initialized" },
    "payment": { "status": "initialized" },
    "kafka": { "status": "initialized" },
    "fileStorage": { "status": "initialized" },
    "externalAPI": { "status": "initialized" }
  }
}
```

#### Shutdown All Services
```http
POST /integrations/shutdown
```

**Response**:
```json
{
  "success": true,
  "data": {
    "email": { "status": "shutdown" },
    "sms": { "status": "shutdown" },
    "payment": { "status": "shutdown" },
    "kafka": { "status": "shutdown" },
    "fileStorage": { "status": "shutdown" },
    "externalAPI": { "status": "shutdown" }
  }
}
```

### Testing Endpoints

#### Send Test Notification
```http
POST /integrations/test/notification
```

**Request Body**:
```json
{
  "type": "email",
  "recipients": [
    {
      "name": "Test User",
      "email": "test@example.com",
      "phone": "+1234567890"
    }
  ],
  "template": "custom",
  "data": {
    "subject": "Test Notification",
    "message": "This is a test notification from Smart Inventory ERP"
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "success": true,
    "messageId": "msg_123456789",
    "transporter": "primary"
  }
}
```

#### Process Test Payment
```http
POST /integrations/test/payment
```

**Request Body**:
```json
{
  "amount": 10.00,
  "currency": "USD",
  "gateway": "stripe",
  "orderId": "test_order_123"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "success": true,
    "transactionId": "pi_123456789",
    "status": "succeeded",
    "amount": 10.00,
    "currency": "USD",
    "gateway": "stripe"
  }
}
```

#### Publish Test Event
```http
POST /integrations/test/event
```

**Request Body**:
```json
{
  "topic": "inventory-events",
  "eventType": "inventory.stock.updated",
  "data": {
    "itemId": "item_123",
    "warehouseId": "warehouse_456",
    "oldQuantity": 100,
    "newQuantity": 80,
    "transactionType": "SALE"
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "success": true,
    "partition": 0,
    "offset": "12345"
  }
}
```

#### Upload Test File
```http
POST /integrations/test/file
```

**Request Body**:
```json
{
  "fileName": "test-document.pdf",
  "fileType": "document",
  "category": "test"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "success": true,
    "fileId": "file_123456789",
    "fileName": "test-document.pdf",
    "fileKey": "tenant123/test/timestamp-random-test-document.pdf",
    "url": "/uploads/tenant123/test/timestamp-random-test-document.pdf",
    "size": 1024,
    "contentType": "application/pdf",
    "provider": "local",
    "uploadedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

#### Sync External Data
```http
POST /integrations/test/sync
```

**Request Body**:
```json
{
  "dataType": "suppliers",
  "options": {
    "supplierId": "supplier_123"
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "success": true,
    "count": 1,
    "suppliers": [
      {
        "id": "supplier_123",
        "name": "Test Supplier",
        "email": "supplier@example.com",
        "phone": "+1234567890"
      }
    ]
  }
}
```

## Integration with Business Modules

### Notifications Module Integration

The integration services are automatically used by the notifications module:

```javascript
// Send alert notification
await integrationManager.sendNotification({
  type: 'email',
  recipients: notificationRecipients,
  template: 'low_stock_alert',
  data: alertData,
  priority: 'high',
  fallbackServices: ['sms']
});
```

### Sales Module Integration

Sales events are automatically published to Kafka:

```javascript
// Publish sales order created event
await integrationManager.publishEvent('sales-events', 'sales.order.created', {
  tenantId,
  orderId: saleOrder.id,
  customerId: customer,
  totalAmount: saleOrder.totalAmount,
  currency: 'USD',
  status: saleOrder.status,
  timestamp: new Date().toISOString()
});
```

### Purchase Module Integration

Purchase orders can trigger notifications and external API sync:

```javascript
// Send purchase order notification
await integrationManager.sendNotification({
  type: 'email',
  recipients: purchaseRecipients,
  template: 'purchase_order_created',
  data: purchaseOrderData,
  priority: 'normal'
});

// Sync supplier data
await integrationManager.syncExternalData(tenantId, 'suppliers', {
  supplierId: purchaseOrder.supplierId
});
```

## Error Handling

All integration endpoints return consistent error responses:

```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message"
}
```

**Common Error Codes**:
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (authentication required)
- `403` - Forbidden (tenant access required)
- `500` - Internal Server Error (service errors)

## Rate Limiting

Integration services implement rate limiting to prevent abuse:

- **Email**: 100 emails per minute
- **SMS**: 50 SMS per minute
- **Payment**: 200 requests per minute
- **External API**: Varies by provider

## Configuration

Integration services are configured through environment variables. See the `src/config/env.js` file for a complete list of required and optional configuration variables.

## Best Practices

1. **Always use the integration manager** instead of calling services directly
2. **Implement fallback services** for critical operations
3. **Monitor service health** regularly
4. **Use appropriate templates** for different notification types
5. **Handle errors gracefully** and provide meaningful error messages
6. **Test integrations** before deploying to production
7. **Monitor rate limits** and implement appropriate queuing

## Support

For integration-related issues or questions, please refer to the service-specific documentation or contact the development team.
