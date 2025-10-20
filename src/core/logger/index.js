const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for structured logging
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const logEntry = {
      timestamp,
      level,
      message,
      ...meta
    };
    
    if (stack) {
      logEntry.stack = stack;
    }
    
    return JSON.stringify(logEntry);
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let logMessage = `${timestamp} [${level}]: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      logMessage += ` ${JSON.stringify(meta)}`;
    }
    
    return logMessage;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: customFormat,
  defaultMeta: {
    service: process.env.SERVICE_NAME || 'smart-inventory-erp',
    version: process.env.SERVICE_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: consoleFormat,
      silent: process.env.NODE_ENV === 'test'
    }),
    
    // File transports
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: customFormat
    }),
    
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: customFormat
    }),
    
    // Audit log for business operations
    new winston.transports.File({
      filename: path.join(logsDir, 'audit.log'),
      level: 'info',
      maxsize: 10485760, // 10MB
      maxFiles: 10,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  ],
  
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log'),
      format: customFormat
    })
  ],
  
  // Handle unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log'),
      format: customFormat
    })
  ]
});

// Add custom methods for structured logging
logger.audit = (action, resource, userId, details = {}) => {
  logger.info('Audit log entry', {
    type: 'audit',
    action,
    resource,
    userId,
    timestamp: new Date().toISOString(),
    ...details
  });
};

logger.security = (event, userId, details = {}) => {
  logger.warn('Security event', {
    type: 'security',
    event,
    userId,
    timestamp: new Date().toISOString(),
    ...details
  });
};

logger.performance = (operation, duration, details = {}) => {
  logger.info('Performance metric', {
    type: 'performance',
    operation,
    duration,
    timestamp: new Date().toISOString(),
    ...details
  });
};

logger.business = (event, details = {}) => {
  logger.info('Business event', {
    type: 'business',
    event,
    timestamp: new Date().toISOString(),
    ...details
  });
};

logger.integration = (service, operation, status, details = {}) => {
  const level = status === 'success' ? 'info' : 'error';
  logger[level]('Integration event', {
    type: 'integration',
    service,
    operation,
    status,
    timestamp: new Date().toISOString(),
    ...details
  });
};

logger.workflow = (workflowId, step, status, details = {}) => {
  const level = status === 'completed' ? 'info' : status === 'failed' ? 'error' : 'warn';
  logger[level]('Workflow event', {
    type: 'workflow',
    workflowId,
    step,
    status,
    timestamp: new Date().toISOString(),
    ...details
  });
};

logger.dataSync = (source, target, operation, status, details = {}) => {
  const level = status === 'success' ? 'info' : 'error';
  logger[level]('Data sync event', {
    type: 'data_sync',
    source,
    target,
    operation,
    status,
    timestamp: new Date().toISOString(),
    ...details
  });
};

logger.notification = (type, recipient, status, details = {}) => {
  const level = status === 'sent' ? 'info' : 'error';
  logger[level]('Notification event', {
    type: 'notification',
    notificationType: type,
    recipient,
    status,
    timestamp: new Date().toISOString(),
    ...details
  });
};

logger.report = (reportType, status, details = {}) => {
  const level = status === 'generated' ? 'info' : 'error';
  logger[level]('Report event', {
    type: 'report',
    reportType,
    status,
    timestamp: new Date().toISOString(),
    ...details
  });
};

logger.backup = (operation, status, details = {}) => {
  const level = status === 'success' ? 'info' : 'error';
  logger[level]('Backup event', {
    type: 'backup',
    operation,
    status,
    timestamp: new Date().toISOString(),
    ...details
  });
};

logger.migration = (version, status, details = {}) => {
  const level = status === 'success' ? 'info' : 'error';
  logger[level]('Migration event', {
    type: 'migration',
    version,
    status,
    timestamp: new Date().toISOString(),
    ...details
  });
};

logger.cache = (operation, key, status, details = {}) => {
  const level = status === 'hit' ? 'debug' : status === 'miss' ? 'info' : 'error';
  logger[level]('Cache event', {
    type: 'cache',
    operation,
    key,
    status,
    timestamp: new Date().toISOString(),
    ...details
  });
};

logger.encryption = (operation, status, details = {}) => {
  const level = status === 'success' ? 'debug' : 'error';
  logger[level]('Encryption event', {
    type: 'encryption',
    operation,
    status,
    timestamp: new Date().toISOString(),
    ...details
  });
};

logger.validation = (field, status, details = {}) => {
  const level = status === 'valid' ? 'debug' : 'warn';
  logger[level]('Validation event', {
    type: 'validation',
    field,
    status,
    timestamp: new Date().toISOString(),
    ...details
  });
};

logger.permission = (resource, action, userId, status, details = {}) => {
  const level = status === 'granted' ? 'debug' : 'warn';
  logger[level]('Permission event', {
    type: 'permission',
    resource,
    action,
    userId,
    status,
    timestamp: new Date().toISOString(),
    ...details
  });
};

logger.tenant = (tenantId, operation, status, details = {}) => {
  const level = status === 'success' ? 'info' : 'error';
  logger[level]('Tenant event', {
    type: 'tenant',
    tenantId,
    operation,
    status,
    timestamp: new Date().toISOString(),
    ...details
  });
};

logger.feature = (feature, plan, status, details = {}) => {
  const level = status === 'enabled' ? 'info' : 'warn';
  logger[level]('Feature event', {
    type: 'feature',
    feature,
    plan,
    status,
    timestamp: new Date().toISOString(),
    ...details
  });
};

logger.maintenance = (operation, status, details = {}) => {
  const level = status === 'started' ? 'info' : status === 'completed' ? 'info' : 'error';
  logger[level]('Maintenance event', {
    type: 'maintenance',
    operation,
    status,
    timestamp: new Date().toISOString(),
    ...details
  });
};

logger.version = (currentVersion, targetVersion, status, details = {}) => {
  const level = status === 'compatible' ? 'info' : 'warn';
  logger[level]('Version event', {
    type: 'version',
    currentVersion,
    targetVersion,
    status,
    timestamp: new Date().toISOString(),
    ...details
  });
};

logger.dependency = (dependency, status, details = {}) => {
  const level = status === 'available' ? 'debug' : 'error';
  logger[level]('Dependency event', {
    type: 'dependency',
    dependency,
    status,
    timestamp: new Date().toISOString(),
    ...details
  });
};

logger.lock = (resource, operation, status, details = {}) => {
  const level = status === 'acquired' ? 'debug' : status === 'released' ? 'debug' : 'warn';
  logger[level]('Lock event', {
    type: 'lock',
    resource,
    operation,
    status,
    timestamp: new Date().toISOString(),
    ...details
  });
};

logger.webhook = (service, event, status, details = {}) => {
  const level = status === 'received' ? 'info' : status === 'processed' ? 'info' : 'error';
  logger[level]('Webhook event', {
    type: 'webhook',
    service,
    event,
    status,
    timestamp: new Date().toISOString(),
    ...details
  });
};

logger.api = (endpoint, method, statusCode, duration, details = {}) => {
  const level = statusCode < 400 ? 'info' : statusCode < 500 ? 'warn' : 'error';
  logger[level]('API event', {
    type: 'api',
    endpoint,
    method,
    statusCode,
    duration,
    timestamp: new Date().toISOString(),
    ...details
  });
};

logger.auth = (provider, operation, status, details = {}) => {
  const level = status === 'success' ? 'info' : 'warn';
  logger[level]('Authentication event', {
    type: 'auth',
    provider,
    operation,
    status,
    timestamp: new Date().toISOString(),
    ...details
  });
};

logger.session = (userId, operation, status, details = {}) => {
  const level = status === 'created' ? 'info' : status === 'destroyed' ? 'info' : 'warn';
  logger[level]('Session event', {
    type: 'session',
    userId,
    operation,
    status,
    timestamp: new Date().toISOString(),
    ...details
  });
};

logger.token = (tokenType, operation, status, details = {}) => {
  const level = status === 'generated' ? 'info' : status === 'validated' ? 'debug' : 'warn';
  logger[level]('Token event', {
    type: 'token',
    tokenType,
    operation,
    status,
    timestamp: new Date().toISOString(),
    ...details
  });
};

logger.password = (userId, operation, status, details = {}) => {
  const level = status === 'changed' ? 'info' : 'warn';
  logger[level]('Password event', {
    type: 'password',
    userId,
    operation,
    status,
    timestamp: new Date().toISOString(),
    ...details
  });
};

logger.account = (userId, operation, status, details = {}) => {
  const level = status === 'locked' ? 'warn' : status === 'unlocked' ? 'info' : status === 'suspended' ? 'warn' : 'info';
  logger[level]('Account event', {
    type: 'account',
    userId,
    operation,
    status,
    timestamp: new Date().toISOString(),
    ...details
  });
};

logger.twoFactor = (userId, operation, status, details = {}) => {
  const level = status === 'enabled' ? 'info' : status === 'disabled' ? 'info' : 'warn';
  logger[level]('Two-factor event', {
    type: 'two_factor',
    userId,
    operation,
    status,
    timestamp: new Date().toISOString(),
    ...details
  });
};

logger.otp = (userId, operation, status, details = {}) => {
  const level = status === 'generated' ? 'info' : status === 'verified' ? 'info' : 'warn';
  logger[level]('OTP event', {
    type: 'otp',
    userId,
    operation,
    status,
    timestamp: new Date().toISOString(),
    ...details
  });
};

logger.sso = (provider, userId, operation, status, details = {}) => {
  const level = status === 'success' ? 'info' : 'warn';
  logger[level]('SSO event', {
    type: 'sso',
    provider,
    userId,
    operation,
    status,
    timestamp: new Date().toISOString(),
    ...details
  });
};

// Add request logging middleware
logger.requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.api(
      req.path,
      req.method,
      res.statusCode,
      duration,
      {
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        userId: req.user?.id,
        tenantId: req.tenant?.id
      }
    );
  });
  
  next();
};

// Add error logging middleware
logger.errorLogger = (err, req, res, next) => {
  logger.error('Request error', {
    type: 'request_error',
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: req.user?.id,
    tenantId: req.tenant?.id,
    timestamp: new Date().toISOString()
  });
  
  next(err);
};

module.exports = logger;
