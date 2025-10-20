const required = [
  'DATABASE_URL',
  'JWT_SECRET',
  'PORT'
];

const optional = [
  // Email Service
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_SECURE',
  'SENDGRID_API_KEY',
  'GMAIL_USER',
  'GMAIL_APP_PASSWORD',
  'EMAIL_FROM',
  
  // SMS Service
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_REGION',
  'TEXTLOCAL_API_KEY',
  'TEXTLOCAL_SENDER',
  'NEXMO_API_KEY',
  'NEXMO_API_SECRET',
  'NEXMO_FROM',
  'TEST_PHONE_NUMBER',
  
  // Payment Gateway
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'PAYPAL_CLIENT_ID',
  'PAYPAL_CLIENT_SECRET',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'SQUARE_APPLICATION_ID',
  'SQUARE_ACCESS_TOKEN',
  
  // Kafka
  'KAFKA_BROKERS',
  'KAFKA_CLIENT_ID',
  
  // File Storage
  'AWS_S3_BUCKET',
  'GOOGLE_CLOUD_PROJECT_ID',
  'GOOGLE_CLOUD_KEY_FILE',
  'GCS_BUCKET_NAME',
  'AZURE_STORAGE_CONNECTION_STRING',
  'AZURE_CONTAINER_NAME',
  'LOCAL_UPLOAD_DIR',
  
  // External APIs
  'SUPPLIER_API_BASE_URL',
  'SUPPLIER_API_TOKEN',
  'CUSTOMER_API_BASE_URL',
  'CUSTOMER_API_TOKEN',
  'SHIPPING_API_BASE_URL',
  'SHIPPING_API_TOKEN',
  'ACCOUNTING_API_BASE_URL',
  'ACCOUNTING_API_TOKEN',
  'INVENTORY_API_BASE_URL',
  'INVENTORY_API_TOKEN'
];

function loadEnv() {
  const missing = required.filter((k) => !process.env[k] || process.env[k].length === 0);
  if (missing.length > 0) {
    const message = `Missing required environment variables: ${missing.join(', ')}`;
    throw new Error(message);
  }

  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: Number(process.env.PORT) || 3000,
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    
    // Integration settings
    integrations: {
      email: {
        smtp: {
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT || 587,
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
          secure: process.env.SMTP_SECURE === 'true'
        },
        sendgrid: {
          apiKey: process.env.SENDGRID_API_KEY
        },
        gmail: {
          user: process.env.GMAIL_USER,
          appPassword: process.env.GMAIL_APP_PASSWORD
        },
        from: process.env.EMAIL_FROM || 'noreply@smartinventory.com'
      },
      
      sms: {
        twilio: {
          accountSid: process.env.TWILIO_ACCOUNT_SID,
          authToken: process.env.TWILIO_AUTH_TOKEN,
          phoneNumber: process.env.TWILIO_PHONE_NUMBER
        },
        aws: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          region: process.env.AWS_REGION || 'us-east-1'
        },
        textlocal: {
          apiKey: process.env.TEXTLOCAL_API_KEY,
          sender: process.env.TEXTLOCAL_SENDER || 'TXTLCL'
        },
        nexmo: {
          apiKey: process.env.NEXMO_API_KEY,
          apiSecret: process.env.NEXMO_API_SECRET,
          from: process.env.NEXMO_FROM || 'SmartInventory'
        },
        testPhoneNumber: process.env.TEST_PHONE_NUMBER
      },
      
      payment: {
        stripe: {
          secretKey: process.env.STRIPE_SECRET_KEY,
          webhookSecret: process.env.STRIPE_WEBHOOK_SECRET
        },
        paypal: {
          clientId: process.env.PAYPAL_CLIENT_ID,
          clientSecret: process.env.PAYPAL_CLIENT_SECRET
        },
        razorpay: {
          keyId: process.env.RAZORPAY_KEY_ID,
          keySecret: process.env.RAZORPAY_KEY_SECRET
        },
        square: {
          applicationId: process.env.SQUARE_APPLICATION_ID,
          accessToken: process.env.SQUARE_ACCESS_TOKEN
        }
      },
      
      kafka: {
        brokers: process.env.KAFKA_BROKERS ? process.env.KAFKA_BROKERS.split(',') : [],
        clientId: process.env.KAFKA_CLIENT_ID || 'smart-inventory-erp'
      },
      
      fileStorage: {
        aws: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          region: process.env.AWS_REGION || 'us-east-1',
          bucket: process.env.AWS_S3_BUCKET || 'smart-inventory-files'
        },
        gcs: {
          projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
          keyFile: process.env.GOOGLE_CLOUD_KEY_FILE,
          bucket: process.env.GCS_BUCKET_NAME || 'smart-inventory-files'
        },
        azure: {
          connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
          container: process.env.AZURE_CONTAINER_NAME || 'smart-inventory-files'
        },
        local: {
          uploadDir: process.env.LOCAL_UPLOAD_DIR || './uploads'
        }
      },
      
      externalAPI: {
        supplier: {
          baseUrl: process.env.SUPPLIER_API_BASE_URL,
          token: process.env.SUPPLIER_API_TOKEN
        },
        customer: {
          baseUrl: process.env.CUSTOMER_API_BASE_URL,
          token: process.env.CUSTOMER_API_TOKEN
        },
        shipping: {
          baseUrl: process.env.SHIPPING_API_BASE_URL,
          token: process.env.SHIPPING_API_TOKEN
        },
        accounting: {
          baseUrl: process.env.ACCOUNTING_API_BASE_URL,
          token: process.env.ACCOUNTING_API_TOKEN
        },
        inventory: {
          baseUrl: process.env.INVENTORY_API_BASE_URL,
          token: process.env.INVENTORY_API_TOKEN
        }
      }
    }
  };
}

module.exports = { loadEnv };


