class AppError extends Error {
  constructor(message, statusCode = 500, details) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

class AuthError extends AppError {
  constructor(message = 'Unauthorized', statusCode = 401, details) {
    super(message, statusCode, details);
  }
}

class ValidationError extends AppError {
  constructor(message = 'Validation failed', details) {
    super(message, 400, details);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Not found', details) {
    super(message, 404, details);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Conflict', details) {
    super(message, 409, details);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details) {
    super(message, 403, details);
  }
}

class PaymentError extends AppError {
  constructor(message = 'Payment processing failed', details) {
    super(message, 402, details);
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded', details) {
    super(message, 429, details);
  }
}

class ServiceUnavailableError extends AppError {
  constructor(message = 'Service unavailable', details) {
    super(message, 503, details);
  }
}

class DatabaseError extends AppError {
  constructor(message = 'Database operation failed', details) {
    super(message, 500, details);
  }
}

class ExternalServiceError extends AppError {
  constructor(message = 'External service error', details) {
    super(message, 502, details);
  }
}

class BusinessLogicError extends AppError {
  constructor(message = 'Business logic violation', details) {
    super(message, 422, details);
  }
}

class InsufficientStockError extends BusinessLogicError {
  constructor(itemName, requestedQuantity, availableQuantity, details) {
    super(
      `Insufficient stock for ${itemName}. Requested: ${requestedQuantity}, Available: ${availableQuantity}`,
      details
    );
    this.itemName = itemName;
    this.requestedQuantity = requestedQuantity;
    this.availableQuantity = availableQuantity;
  }
}

class DuplicateResourceError extends ConflictError {
  constructor(resourceType, identifier, details) {
    super(
      `${resourceType} with identifier '${identifier}' already exists`,
      details
    );
    this.resourceType = resourceType;
    this.identifier = identifier;
  }
}

class ExpiredResourceError extends BusinessLogicError {
  constructor(resourceType, identifier, expiryDate, details) {
    super(
      `${resourceType} with identifier '${identifier}' has expired on ${expiryDate}`,
      details
    );
    this.resourceType = resourceType;
    this.identifier = identifier;
    this.expiryDate = expiryDate;
  }
}

class QuotaExceededError extends BusinessLogicError {
  constructor(quotaType, currentUsage, limit, details) {
    super(
      `${quotaType} quota exceeded. Current usage: ${currentUsage}, Limit: ${limit}`,
      details
    );
    this.quotaType = quotaType;
    this.currentUsage = currentUsage;
    this.limit = limit;
  }
}

class InvalidStateError extends BusinessLogicError {
  constructor(resourceType, currentState, requiredState, details) {
    super(
      `${resourceType} is in invalid state '${currentState}'. Required state: '${requiredState}'`,
      details
    );
    this.resourceType = resourceType;
    this.currentState = currentState;
    this.requiredState = requiredState;
  }
}

class ConfigurationError extends AppError {
  constructor(message = 'Configuration error', details) {
    super(message, 500, details);
  }
}

class NetworkError extends ExternalServiceError {
  constructor(message = 'Network error', details) {
    super(message, details);
  }
}

class TimeoutError extends ExternalServiceError {
  constructor(message = 'Request timeout', details) {
    super(message, details);
  }
}

class FileProcessingError extends AppError {
  constructor(message = 'File processing failed', details) {
    super(message, 422, details);
  }
}

class DataIntegrityError extends DatabaseError {
  constructor(message = 'Data integrity violation', details) {
    super(message, details);
  }
}

class ConcurrencyError extends ConflictError {
  constructor(resourceType, identifier, details) {
    super(
      `Concurrent modification detected for ${resourceType} '${identifier}'`,
      details
    );
    this.resourceType = resourceType;
    this.identifier = identifier;
  }
}

class AuditTrailError extends AppError {
  constructor(message = 'Audit trail error', details) {
    super(message, 500, details);
  }
}

class NotificationError extends ExternalServiceError {
  constructor(message = 'Notification delivery failed', details) {
    super(message, details);
  }
}

class ReportGenerationError extends AppError {
  constructor(message = 'Report generation failed', details) {
    super(message, 500, details);
  }
}

class BackupError extends AppError {
  constructor(message = 'Backup operation failed', details) {
    super(message, 500, details);
  }
}

class MigrationError extends DatabaseError {
  constructor(message = 'Database migration failed', details) {
    super(message, details);
  }
}

class CacheError extends AppError {
  constructor(message = 'Cache operation failed', details) {
    super(message, 500, details);
  }
}

class EncryptionError extends AppError {
  constructor(message = 'Encryption/decryption failed', details) {
    super(message, 500, details);
  }
}

class SerializationError extends AppError {
  constructor(message = 'Data serialization failed', details) {
    super(message, 500, details);
  }
}

class DeserializationError extends AppError {
  constructor(message = 'Data deserialization failed', details) {
    super(message, 500, details);
  }
}

class SchemaValidationError extends ValidationError {
  constructor(message = 'Schema validation failed', details) {
    super(message, details);
  }
}

class PermissionError extends ForbiddenError {
  constructor(resource, action, details) {
    super(
      `Permission denied: Cannot ${action} ${resource}`,
      details
    );
    this.resource = resource;
    this.action = action;
  }
}

class TenantError extends ForbiddenError {
  constructor(message = 'Tenant access violation', details) {
    super(message, details);
  }
}

class FeatureNotAvailableError extends ForbiddenError {
  constructor(feature, plan, details) {
    super(
      `Feature '${feature}' is not available in ${plan} plan`,
      details
    );
    this.feature = feature;
    this.plan = plan;
  }
}

class MaintenanceModeError extends ServiceUnavailableError {
  constructor(message = 'System is under maintenance', details) {
    super(message, details);
  }
}

class VersionMismatchError extends ConflictError {
  constructor(currentVersion, requiredVersion, details) {
    super(
      `Version mismatch. Current: ${currentVersion}, Required: ${requiredVersion}`,
      details
    );
    this.currentVersion = currentVersion;
    this.requiredVersion = requiredVersion;
  }
}

class DependencyError extends AppError {
  constructor(dependency, message = 'Dependency error', details) {
    super(`${message}: ${dependency}`, 500, details);
    this.dependency = dependency;
  }
}

class CircularDependencyError extends DependencyError {
  constructor(dependencies, details) {
    super(
      dependencies.join(' -> '),
      'Circular dependency detected',
      details
    );
    this.dependencies = dependencies;
  }
}

class ResourceLockedError extends ConflictError {
  constructor(resourceType, identifier, lockedBy, details) {
    super(
      `${resourceType} '${identifier}' is locked by ${lockedBy}`,
      details
    );
    this.resourceType = resourceType;
    this.identifier = identifier;
    this.lockedBy = lockedBy;
  }
}

class WorkflowError extends BusinessLogicError {
  constructor(workflowStep, message = 'Workflow error', details) {
    super(`${message} at step: ${workflowStep}`, details);
    this.workflowStep = workflowStep;
  }
}

class IntegrationError extends ExternalServiceError {
  constructor(service, message = 'Integration error', details) {
    super(`${message} with service: ${service}`, details);
    this.service = service;
  }
}

class DataSyncError extends IntegrationError {
  constructor(service, dataType, message = 'Data synchronization failed', details) {
    super(service, `${message} for ${dataType}`, details);
    this.dataType = dataType;
  }
}

class WebhookError extends IntegrationError {
  constructor(service, message = 'Webhook processing failed', details) {
    super(service, message, details);
  }
}

class APIError extends ExternalServiceError {
  constructor(service, statusCode, message = 'API error', details) {
    super(`${message} from ${service} (${statusCode})`, details);
    this.service = service;
    this.apiStatusCode = statusCode;
  }
}

class AuthenticationProviderError extends AuthError {
  constructor(provider, message = 'Authentication provider error', details) {
    super(`${message} with provider: ${provider}`, 401, details);
    this.provider = provider;
  }
}

class SessionError extends AuthError {
  constructor(message = 'Session error', details) {
    super(message, 401, details);
  }
}

class TokenError extends AuthError {
  constructor(tokenType, message = 'Token error', details) {
    super(`${message} for ${tokenType} token`, 401, details);
    this.tokenType = tokenType;
  }
}

class PasswordError extends AuthError {
  constructor(message = 'Password error', details) {
    super(message, 400, details);
  }
}

class AccountLockedError extends AuthError {
  constructor(lockReason, unlockTime, details) {
    super(
      `Account locked: ${lockReason}. Unlock time: ${unlockTime}`,
      423,
      details
    );
    this.lockReason = lockReason;
    this.unlockTime = unlockTime;
  }
}

class AccountSuspendedError extends AuthError {
  constructor(suspensionReason, suspensionEnd, details) {
    super(
      `Account suspended: ${suspensionReason}. Suspension ends: ${suspensionEnd}`,
      423,
      details
    );
    this.suspensionReason = suspensionReason;
    this.suspensionEnd = suspensionEnd;
  }
}

class TwoFactorError extends AuthError {
  constructor(message = 'Two-factor authentication error', details) {
    super(message, 401, details);
  }
}

class OTPError extends AuthError {
  constructor(message = 'OTP error', details) {
    super(message, 401, details);
  }
}

class SSOError extends AuthError {
  constructor(provider, message = 'SSO error', details) {
    super(`${message} with SSO provider: ${provider}`, 401, details);
    this.provider = provider;
  }
}

module.exports = { 
  AppError,
  AuthError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  PaymentError,
  RateLimitError,
  ServiceUnavailableError,
  DatabaseError,
  ExternalServiceError,
  BusinessLogicError,
  InsufficientStockError,
  DuplicateResourceError,
  ExpiredResourceError,
  QuotaExceededError,
  InvalidStateError,
  ConfigurationError,
  NetworkError,
  TimeoutError,
  FileProcessingError,
  DataIntegrityError,
  ConcurrencyError,
  AuditTrailError,
  NotificationError,
  ReportGenerationError,
  BackupError,
  MigrationError,
  CacheError,
  EncryptionError,
  SerializationError,
  DeserializationError,
  SchemaValidationError,
  PermissionError,
  TenantError,
  FeatureNotAvailableError,
  MaintenanceModeError,
  VersionMismatchError,
  DependencyError,
  CircularDependencyError,
  ResourceLockedError,
  WorkflowError,
  IntegrationError,
  DataSyncError,
  WebhookError,
  APIError,
  AuthenticationProviderError,
  SessionError,
  TokenError,
  PasswordError,
  AccountLockedError,
  AccountSuspendedError,
  TwoFactorError,
  OTPError,
  SSOError
};


