const { AppError } = require('../exceptions');
const { logger } = require('../../config/logger');

function errorHandler(err, req, res, next) {
  const isAppError = err instanceof AppError;
  const status = isAppError ? err.statusCode : 500;
  const message = isAppError ? err.message : 'Internal Server Error';

  logger.error({ err, path: req.path }, 'Request failed');

  res.status(status).json({
    success: false,
    message,
    details: isAppError ? err.details : undefined,
    traceId: req.headers['x-request-id'] || undefined,
  });
}

module.exports = { errorHandler };


