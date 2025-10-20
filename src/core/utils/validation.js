/**
 * Data Validation Utilities
 * 
 * Comprehensive data validation functions for input sanitization,
 * type checking, and business rule validation
 */

const { ValidationError } = require('../exceptions');

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidPhone(phone, format = 'international') {
  if (!phone) return false;
  
  const cleaned = phone.replace(/\D/g, '');
  
  switch (format) {
    case 'international':
      return cleaned.length >= 10 && cleaned.length <= 15;
    case 'national':
      return cleaned.length >= 7 && cleaned.length <= 12;
    case 'us':
      return cleaned.length === 10 || (cleaned.length === 11 && cleaned.startsWith('1'));
    default:
      return cleaned.length >= 7;
  }
}

function validateSKU(sku, rules = {}) {
  const {
    minLength = 3,
    maxLength = 50,
    allowSpecialChars = false,
    requiredPrefix = null,
    requiredSuffix = null
  } = rules;

  if (!sku || typeof sku !== 'string') {
    return { valid: false, error: 'SKU is required and must be a string' };
  }

  if (sku.length < minLength || sku.length > maxLength) {
    return { valid: false, error: `SKU must be between ${minLength} and ${maxLength} characters` };
  }

  if (requiredPrefix && !sku.startsWith(requiredPrefix)) {
    return { valid: false, error: `SKU must start with "${requiredPrefix}"` };
  }

  if (requiredSuffix && !sku.endsWith(requiredSuffix)) {
    return { valid: false, error: `SKU must end with "${requiredSuffix}"` };
  }

  if (!allowSpecialChars) {
    const specialCharRegex = /[^a-zA-Z0-9\-_]/;
    if (specialCharRegex.test(sku)) {
      return { valid: false, error: 'SKU contains invalid special characters' };
    }
  }

  return { valid: true };
}

function validateQuantity(quantity, rules = {}) {
  const {
    min = 0,
    max = Infinity,
    allowDecimals = true,
    allowZero = false,
    allowNegative = false
  } = rules;

  const num = parseFloat(quantity);

  if (isNaN(num)) {
    return { valid: false, error: 'Quantity must be a valid number' };
  }

  if (!allowDecimals && !Number.isInteger(num)) {
    return { valid: false, error: 'Quantity must be a whole number' };
  }

  if (!allowZero && num === 0) {
    return { valid: false, error: 'Quantity cannot be zero' };
  }

  if (!allowNegative && num < 0) {
    return { valid: false, error: 'Quantity cannot be negative' };
  }

  if (num < min) {
    return { valid: false, error: `Quantity must be at least ${min}` };
  }

  if (num > max) {
    return { valid: false, error: `Quantity cannot exceed ${max}` };
  }

  return { valid: true, value: num };
}

function validatePrice(price, rules = {}) {
  const {
    min = 0,
    max = Infinity,
    allowZero = false,
    allowNegative = false,
    decimalPlaces = 2
  } = rules;

  const num = parseFloat(price);

  if (isNaN(num)) {
    return { valid: false, error: 'Price must be a valid number' };
  }

  if (!allowZero && num === 0) {
    return { valid: false, error: 'Price cannot be zero' };
  }

  if (!allowNegative && num < 0) {
    return { valid: false, error: 'Price cannot be negative' };
  }

  if (num < min) {
    return { valid: false, error: `Price must be at least ${min}` };
  }

  if (num > max) {
    return { valid: false, error: `Price cannot exceed ${max}` };
  }

  // Check decimal places
  const decimalPart = num.toString().split('.')[1];
  if (decimalPart && decimalPart.length > decimalPlaces) {
    return { valid: false, error: `Price cannot have more than ${decimalPlaces} decimal places` };
  }

  return { valid: true, value: parseFloat(num.toFixed(decimalPlaces)) };
}

function validateDateRange(startDate, endDate, rules = {}) {
  const {
    allowSameDate = true,
    maxRangeDays = Infinity,
    minRangeDays = 0,
    allowFutureDates = true,
    allowPastDates = true
  } = rules;

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime())) {
    return { valid: false, error: 'Invalid start date' };
  }

  if (isNaN(end.getTime())) {
    return { valid: false, error: 'Invalid end date' };
  }

  if (start > end) {
    return { valid: false, error: 'Start date cannot be after end date' };
  }

  if (!allowSameDate && start.getTime() === end.getTime()) {
    return { valid: false, error: 'Start and end dates cannot be the same' };
  }

  const rangeDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  
  if (rangeDays < minRangeDays) {
    return { valid: false, error: `Date range must be at least ${minRangeDays} days` };
  }

  if (rangeDays > maxRangeDays) {
    return { valid: false, error: `Date range cannot exceed ${maxRangeDays} days` };
  }

  const now = new Date();
  
  if (!allowFutureDates && start > now) {
    return { valid: false, error: 'Start date cannot be in the future' };
  }

  if (!allowPastDates && end < now) {
    return { valid: false, error: 'End date cannot be in the past' };
  }

  return { valid: true, startDate: start, endDate: end, rangeDays };
}

function validateInventoryOperation(operation, rules = {}) {
  const {
    requirePositiveQuantity = true,
    allowZeroQuantity = false,
    maxQuantityPerTransaction = Infinity,
    requireCostForPurchase = true,
    requireCostForSale = false
  } = rules;

  const errors = [];

  // Validate quantity
  const quantityValidation = validateQuantity(operation.quantity, {
    min: allowZeroQuantity ? 0 : 1,
    max: maxQuantityPerTransaction,
    allowDecimals: true,
    allowZero: allowZeroQuantity,
    allowNegative: false
  });

  if (!quantityValidation.valid) {
    errors.push(quantityValidation.error);
  }

  // Validate cost based on operation type
  if (operation.type === 'PURCHASE' && requireCostForPurchase) {
    if (!operation.costPerUnit || operation.costPerUnit <= 0) {
      errors.push('Cost per unit is required for purchase operations');
    }
  }

  if (operation.type === 'SALE' && requireCostForSale) {
    if (!operation.costPerUnit || operation.costPerUnit <= 0) {
      errors.push('Cost per unit is required for sale operations');
    }
  }

  // Validate required fields
  if (!operation.itemId) {
    errors.push('Item ID is required');
  }

  if (!operation.warehouseId) {
    errors.push('Warehouse ID is required');
  }

  if (!operation.type) {
    errors.push('Operation type is required');
  }

  return {
    valid: errors.length === 0,
    errors,
    data: {
      ...operation,
      quantity: quantityValidation.value
    }
  };
}

function validateUserInput(input, rules = {}) {
  const {
    maxLength = 1000,
    allowHtml = false,
    allowScripts = false,
    allowSpecialChars = true,
    sanitize = true
  } = rules;

  if (!input || typeof input !== 'string') {
    return { valid: false, error: 'Input must be a non-empty string' };
  }

  if (input.length > maxLength) {
    return { valid: false, error: `Input cannot exceed ${maxLength} characters` };
  }

  let sanitizedInput = input;

  // Remove HTML tags if not allowed
  if (!allowHtml) {
    sanitizedInput = sanitizedInput.replace(/<[^>]*>/g, '');
  }

  // Remove script tags if not allowed
  if (!allowScripts) {
    sanitizedInput = sanitizedInput.replace(/<script[^>]*>.*?<\/script>/gi, '');
    sanitizedInput = sanitizedInput.replace(/javascript:/gi, '');
  }

  // Remove special characters if not allowed
  if (!allowSpecialChars) {
    sanitizedInput = sanitizedInput.replace(/[^a-zA-Z0-9\s]/g, '');
  }

  // Check for potential SQL injection patterns
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i,
    /(--|\/\*|\*\/)/,
    /(;|\||&)/
  ];

  const hasSqlInjection = sqlPatterns.some(pattern => pattern.test(input));
  if (hasSqlInjection) {
    return { valid: false, error: 'Input contains potentially malicious content' };
  }

  return {
    valid: true,
    sanitized: sanitize ? sanitizedInput : input,
    original: input
  };
}

function validateFileUpload(file, rules = {}) {
  const {
    maxSize = 10 * 1024 * 1024, // 10MB default
    allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'],
    allowedExtensions = ['.jpg', '.jpeg', '.png', '.pdf'],
    requireName = true
  } = rules;

  const errors = [];

  if (!file) {
    return { valid: false, error: 'File is required' };
  }

  if (requireName && (!file.name || file.name.trim() === '')) {
    errors.push('File name is required');
  }

  if (file.size > maxSize) {
    errors.push(`File size cannot exceed ${maxSize / (1024 * 1024)}MB`);
  }

  if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
    errors.push(`File type not allowed. Allowed types: ${allowedTypes.join(', ')}`);
  }

  if (allowedExtensions.length > 0) {
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    if (!allowedExtensions.includes(fileExtension)) {
      errors.push(`File extension not allowed. Allowed extensions: ${allowedExtensions.join(', ')}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    file: {
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified
    }
  };
}

function validatePagination(params, rules = {}) {
  const {
    maxLimit = 100,
    defaultLimit = 20,
    minLimit = 1,
    allowZeroLimit = false
  } = rules;

  const page = parseInt(params.page) || 1;
  const limit = parseInt(params.limit) || defaultLimit;

  const errors = [];

  if (page < 1) {
    errors.push('Page number must be at least 1');
  }

  if (limit < minLimit) {
    errors.push(`Limit must be at least ${minLimit}`);
  }

  if (limit > maxLimit) {
    errors.push(`Limit cannot exceed ${maxLimit}`);
  }

  if (!allowZeroLimit && limit === 0) {
    errors.push('Limit cannot be zero');
  }

  return {
    valid: errors.length === 0,
    errors,
    pagination: {
      page: Math.max(1, page),
      limit: Math.min(maxLimit, Math.max(minLimit, limit)),
      offset: (Math.max(1, page) - 1) * Math.min(maxLimit, Math.max(minLimit, limit))
    }
  };
}

function validateTenantData(tenantData) {
  const errors = [];

  if (!tenantData.name || tenantData.name.trim() === '') {
    errors.push('Tenant name is required');
  }

  if (tenantData.name && tenantData.name.length > 100) {
    errors.push('Tenant name cannot exceed 100 characters');
  }

  if (tenantData.domain && !isValidDomain(tenantData.domain)) {
    errors.push('Invalid domain format');
  }

  if (tenantData.email && !isValidEmail(tenantData.email)) {
    errors.push('Invalid email format');
  }

  return {
    valid: errors.length === 0,
    errors,
    data: {
      name: tenantData.name?.trim(),
      domain: tenantData.domain?.trim(),
      email: tenantData.email?.trim(),
      plan: tenantData.plan || 'BASIC'
    }
  };
}

function isValidDomain(domain) {
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/;
  return domainRegex.test(domain);
}

function validate(data, schema) {
  const errors = [];
  const validatedData = {};

  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];
    const fieldErrors = [];

    // Required field check
    if (rules.required && (value === undefined || value === null || value === '')) {
      fieldErrors.push(`${field} is required`);
    }

    // Type validation
    if (value !== undefined && value !== null && rules.type) {
      if (rules.type === 'string' && typeof value !== 'string') {
        fieldErrors.push(`${field} must be a string`);
      } else if (rules.type === 'number' && typeof value !== 'number' && isNaN(parseFloat(value))) {
        fieldErrors.push(`${field} must be a number`);
      } else if (rules.type === 'boolean' && typeof value !== 'boolean') {
        fieldErrors.push(`${field} must be a boolean`);
      } else if (rules.type === 'email' && !isValidEmail(value)) {
        fieldErrors.push(`${field} must be a valid email`);
      } else if (rules.type === 'phone' && !isValidPhone(value)) {
        fieldErrors.push(`${field} must be a valid phone number`);
      }
    }

    // Length validation
    if (value && rules.minLength && value.length < rules.minLength) {
      fieldErrors.push(`${field} must be at least ${rules.minLength} characters`);
    }

    if (value && rules.maxLength && value.length > rules.maxLength) {
      fieldErrors.push(`${field} cannot exceed ${rules.maxLength} characters`);
    }

    // Range validation
    if (value && rules.min !== undefined && parseFloat(value) < rules.min) {
      fieldErrors.push(`${field} must be at least ${rules.min}`);
    }

    if (value && rules.max !== undefined && parseFloat(value) > rules.max) {
      fieldErrors.push(`${field} cannot exceed ${rules.max}`);
    }

    // Custom validation
    if (value && rules.custom) {
      const customResult = rules.custom(value);
      if (!customResult.valid) {
        fieldErrors.push(customResult.error);
      }
    }

    if (fieldErrors.length > 0) {
      errors.push(...fieldErrors);
    } else {
      validatedData[field] = value;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    data: validatedData
  };
}

module.exports = {
  isValidEmail,
  isValidPhone,
  validateSKU,
  validateQuantity,
  validatePrice,
  validateDateRange,
  validateInventoryOperation,
  validateUserInput,
  validateFileUpload,
  validatePagination,
  validateTenantData,
  isValidDomain,
  validate
};
