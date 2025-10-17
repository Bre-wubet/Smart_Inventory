const { logger } = require('../../config');

function validateEnv(req, res, next) {
  const requiredEnvVars = [
    'DATABASE_URL',
    'JWT_SECRET',
    'REDIS_URL'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    logger.error('Missing required environment variables:', missingVars);
    return res.status(500).json({
      error: 'Server configuration error',
      message: 'Missing required environment variables',
      missing: missingVars
    });
  }

  next();
}

module.exports = { validateEnv };
