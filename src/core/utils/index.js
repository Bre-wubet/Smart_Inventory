/**
 * Core Utilities Index
 * 
 * Centralized export of all utility functions for easy access
 * across the application
 */

// Cost calculation utilities
const costCalculation = require('./costCalculation');

// Stock management utilities
const stockFormulas = require('./stockFormulas');

// Data validation utilities
const validation = require('./validation');

// Date and time utilities
const dateTime = require('./dateTime');

// Financial utilities
const financial = require('./financial');

// Performance and optimization utilities
const performance = require('./performance');

// Re-export all utilities for easy access
module.exports = {
  // Cost calculation functions
  ...costCalculation,
  
  // Stock management functions
  ...stockFormulas,
  
  // Validation functions
  ...validation,
  
  // Date/time functions
  ...dateTime,
  
  // Financial functions
  ...financial,
  
  // Performance functions
  ...performance,
  
  // Utility categories for organized access
  costCalculation,
  stockFormulas,
  validation,
  dateTime,
  financial,
  performance
};
