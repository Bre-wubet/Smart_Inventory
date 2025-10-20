/**
 * Performance and Optimization Utilities
 * 
 * Comprehensive performance monitoring, caching, and optimization
 * functions for improved system efficiency
 */

const { logger } = require('../../config/logger');

/**
 * Simple in-memory cache implementation
 */
class MemoryCache {
  constructor(options = {}) {
    this.cache = new Map();
    this.maxSize = options.maxSize || 1000;
    this.ttl = options.ttl || 300000; // 5 minutes default
    this.cleanupInterval = options.cleanupInterval || 60000; // 1 minute
    
    // Start cleanup interval
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);
  }

  set(key, value, ttl = this.ttl) {
    // Remove oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    const expiry = Date.now() + ttl;
    this.cache.set(key, { value, expiry });
  }

  get(key) {
    const item = this.cache.get(key);
    
    if (!item) {
      return null;
    }

    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  has(key) {
    return this.get(key) !== null;
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }

  cleanup() {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiry) {
        this.cache.delete(key);
      }
    }
  }

  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.clear();
  }
}

// Global cache instance
const globalCache = new MemoryCache();

/**
 * Cache decorator for functions
 * @param {Function} fn - Function to cache
 * @param {Object} options - Cache options
 * @returns {Function} Cached function
 */
function cache(fn, options = {}) {
  const {
    ttl = 300000,
    keyGenerator = (...args) => JSON.stringify(args),
    cacheInstance = globalCache
  } = options;

  return async function(...args) {
    const key = keyGenerator(...args);
    const cached = cacheInstance.get(key);
    
    if (cached !== null) {
      return cached;
    }

    const result = await fn(...args);
    cacheInstance.set(key, result, ttl);
    return result;
  };
}

/**
 * Performance monitoring decorator
 * @param {Function} fn - Function to monitor
 * @param {Object} options - Monitoring options
 * @returns {Function} Monitored function
 */
function monitorPerformance(fn, options = {}) {
  const {
    logThreshold = 1000, // Log if execution takes more than 1 second
    logFunction = logger.info,
    context = 'function'
  } = options;

  return async function(...args) {
    const startTime = Date.now();
    const startMemory = process.memoryUsage();
    
    try {
      const result = await fn(...args);
      const endTime = Date.now();
      const endMemory = process.memoryUsage();
      
      const executionTime = endTime - startTime;
      const memoryDelta = endMemory.heapUsed - startMemory.heapUsed;
      
      if (executionTime > logThreshold) {
        logFunction({
          context,
          function: fn.name || 'anonymous',
          executionTime,
          memoryDelta,
          args: args.length
        }, `Slow ${context} execution detected`);
      }
      
      return result;
    } catch (error) {
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      
      logFunction({
        context,
        function: fn.name || 'anonymous',
        executionTime,
        error: error.message
      }, `Error in ${context} execution`);
      
      throw error;
    }
  };
}

/**
 * Retry mechanism with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {Object} options - Retry options
 * @returns {Function} Function with retry logic
 */
function withRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    backoffFactor = 2,
    retryCondition = (error) => true
  } = options;

  return async function(...args) {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn(...args);
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries || !retryCondition(error)) {
          throw error;
        }
        
        const delay = Math.min(
          baseDelay * Math.pow(backoffFactor, attempt),
          maxDelay
        );
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  };
}

/**
 * Batch processing utility
 * @param {Array} items - Items to process
 * @param {Function} processor - Processing function
 * @param {Object} options - Batch options
 * @returns {Array} Processed results
 */
async function processBatch(items, processor, options = {}) {
  const {
    batchSize = 10,
    concurrency = 1,
    delayBetweenBatches = 0
  } = options;

  const results = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    if (concurrency === 1) {
      // Sequential processing
      for (const item of batch) {
        const result = await processor(item);
        results.push(result);
      }
    } else {
      // Concurrent processing
      const batchPromises = batch.map(item => processor(item));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    // Delay between batches if specified
    if (delayBetweenBatches > 0 && i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }
  
  return results;
}

/**
 * Debounce function
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(fn, delay) {
  let timeoutId;
  
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Throttle function
 * @param {Function} fn - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} Throttled function
 */
function throttle(fn, limit) {
  let inThrottle;
  
  return function(...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Memory usage monitoring
 * @returns {Object} Memory usage information
 */
function getMemoryUsage() {
  const usage = process.memoryUsage();
  
  return {
    rss: Math.round(usage.rss / 1024 / 1024), // MB
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
    external: Math.round(usage.external / 1024 / 1024), // MB
    arrayBuffers: Math.round(usage.arrayBuffers / 1024 / 1024) // MB
  };
}

/**
 * CPU usage monitoring
 * @returns {Promise<Object>} CPU usage information
 */
async function getCPUUsage() {
  const startUsage = process.cpuUsage();
  
  return new Promise((resolve) => {
    setTimeout(() => {
      const endUsage = process.cpuUsage(startUsage);
      const totalUsage = endUsage.user + endUsage.system;
      
      resolve({
        user: endUsage.user / 1000, // microseconds to milliseconds
        system: endUsage.system / 1000,
        total: totalUsage / 1000,
        percentage: (totalUsage / 1000000) * 100 // rough percentage
      });
    }, 100);
  });
}

/**
 * Database query optimization helper
 * @param {Object} query - Database query object
 * @param {Object} options - Optimization options
 * @returns {Object} Optimized query
 */
function optimizeQuery(query, options = {}) {
  const {
    maxLimit = 1000,
    defaultLimit = 20,
    enablePagination = true,
    addIndexHints = false
  } = options;

  const optimized = { ...query };

  // Limit optimization
  if (optimized.take && optimized.take > maxLimit) {
    optimized.take = maxLimit;
  } else if (!optimized.take && enablePagination) {
    optimized.take = defaultLimit;
  }

  // Skip optimization
  if (optimized.skip && optimized.skip < 0) {
    optimized.skip = 0;
  }

  // Order by optimization
  if (!optimized.orderBy && enablePagination) {
    optimized.orderBy = { createdAt: 'desc' };
  }

  // Select optimization
  if (!optimized.select && !optimized.include) {
    optimized.select = { id: true };
  }

  return optimized;
}

/**
 * Response compression helper
 * @param {Object} data - Data to compress
 * @param {Object} options - Compression options
 * @returns {Object} Compressed response
 */
function compressResponse(data, options = {}) {
  const {
    maxSize = 1024, // 1KB
    compressionThreshold = 0.8,
    removeNulls = true,
    removeEmptyArrays = false
  } = options;

  let compressed = data;

  // Remove null values
  if (removeNulls) {
    compressed = removeNullValues(compressed);
  }

  // Remove empty arrays
  if (removeEmptyArrays) {
    compressed = removeEmptyArrays(compressed);
  }

  // Calculate compression ratio
  const originalSize = JSON.stringify(data).length;
  const compressedSize = JSON.stringify(compressed).length;
  const compressionRatio = compressedSize / originalSize;

  return {
    data: compressed,
    originalSize,
    compressedSize,
    compressionRatio: parseFloat(compressionRatio.toFixed(3)),
    isCompressed: compressionRatio < compressionThreshold
  };
}

/**
 * Remove null values from object
 * @param {Object} obj - Object to clean
 * @returns {Object} Cleaned object
 */
function removeNullValues(obj) {
  if (Array.isArray(obj)) {
    return obj.map(removeNullValues).filter(item => item !== null);
  }
  
  if (obj !== null && typeof obj === 'object') {
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== null) {
        cleaned[key] = removeNullValues(value);
      }
    }
    return cleaned;
  }
  
  return obj;
}

/**
 * Remove empty arrays from object
 * @param {Object} obj - Object to clean
 * @returns {Object} Cleaned object
 */
function removeEmptyArrays(obj) {
  if (Array.isArray(obj)) {
    return obj.map(removeEmptyArrays).filter(item => 
      !Array.isArray(item) || item.length > 0
    );
  }
  
  if (obj !== null && typeof obj === 'object') {
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      if (!Array.isArray(value) || value.length > 0) {
        cleaned[key] = removeEmptyArrays(value);
      }
    }
    return cleaned;
  }
  
  return obj;
}

/**
 * Performance metrics collector
 */
class PerformanceMetrics {
  constructor() {
    this.metrics = new Map();
    this.startTimes = new Map();
  }

  start(label) {
    this.startTimes.set(label, Date.now());
  }

  end(label) {
    const startTime = this.startTimes.get(label);
    if (!startTime) {
      throw new Error(`No start time found for label: ${label}`);
    }

    const duration = Date.now() - startTime;
    this.startTimes.delete(label);

    if (!this.metrics.has(label)) {
      this.metrics.set(label, []);
    }

    this.metrics.get(label).push(duration);
    return duration;
  }

  getMetrics(label) {
    const times = this.metrics.get(label) || [];
    if (times.length === 0) {
      return null;
    }

    const sorted = [...times].sort((a, b) => a - b);
    const sum = times.reduce((a, b) => a + b, 0);

    return {
      count: times.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / times.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }

  getAllMetrics() {
    const result = {};
    for (const label of this.metrics.keys()) {
      result[label] = this.getMetrics(label);
    }
    return result;
  }

  reset() {
    this.metrics.clear();
    this.startTimes.clear();
  }
}

// Global performance metrics instance
const globalMetrics = new PerformanceMetrics();

/**
 * Database connection pool monitoring
 * @param {Object} pool - Database connection pool
 * @returns {Object} Pool statistics
 */
function getPoolStats(pool) {
  if (!pool || typeof pool !== 'object') {
    return null;
  }

  return {
    totalConnections: pool.totalConnections || 0,
    idleConnections: pool.idleConnections || 0,
    activeConnections: pool.activeConnections || 0,
    waitingClients: pool.waitingClients || 0,
    maxConnections: pool.maxConnections || 0,
    utilizationRate: pool.maxConnections > 0 ? 
      ((pool.activeConnections || 0) / pool.maxConnections * 100).toFixed(2) : 0
  };
}

/**
 * Rate limiting helper
 * @param {string} key - Rate limit key
 * @param {Object} options - Rate limit options
 * @returns {boolean} True if request is allowed
 */
function checkRateLimit(key, options = {}) {
  const {
    windowMs = 60000, // 1 minute
    maxRequests = 100,
    cacheInstance = globalCache
  } = options;

  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const cacheKey = `rate_limit_${key}_${windowStart}`;
  
  const currentCount = cacheInstance.get(cacheKey) || 0;
  
  if (currentCount >= maxRequests) {
    return false;
  }
  
  cacheInstance.set(cacheKey, currentCount + 1, windowMs);
  return true;
}

module.exports = {
  MemoryCache,
  globalCache,
  cache,
  monitorPerformance,
  withRetry,
  processBatch,
  debounce,
  throttle,
  getMemoryUsage,
  getCPUUsage,
  optimizeQuery,
  compressResponse,
  removeNullValues,
  removeEmptyArrays,
  PerformanceMetrics,
  globalMetrics,
  getPoolStats,
  checkRateLimit
};
