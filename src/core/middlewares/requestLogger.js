const { logger } = require('../../config');

function requestLogger(req, res, next) {
  const start = Date.now();
  
  // Log request start
  logger.info({
    type: 'request_start',
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    requestId: req.requestId
  });

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const duration = Date.now() - start;
    
    logger.info({
      type: 'request_end',
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('Content-Length'),
      requestId: req.requestId
    });

    originalEnd.call(this, chunk, encoding);
  };

  next();
}

module.exports = { requestLogger };
