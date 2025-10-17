const { AppError, NotFoundError } = require('../exceptions');
const { logger } = require('../../config');

function errorHandler(err, req, res, next) {
  const isAppError = err instanceof AppError;
  const status = isAppError ? err.statusCode : 500;
  const message = isAppError ? err.message : 'Internal Server Error';

  // Log error with context
  logger.error({
    error: {
      message: err.message,
      stack: err.stack,
      name: err.name
    },
    request: {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
      params: req.params,
      query: req.query
    },
    requestId: req.requestId
  }, 'Request failed');

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(status).json({
    success: false,
    message,
    details: isAppError ? err.details : undefined,
    ...(isDevelopment && { 
      stack: err.stack,
      error: err.message 
    }),
    requestId: req.requestId,
    timestamp: new Date().toISOString()
  });
}

function notFoundHandler(req, res, next) {
  const error = new NotFoundError(`Route ${req.method} ${req.path} not found`);
  next(error);
}

module.exports = { errorHandler, notFoundHandler };


