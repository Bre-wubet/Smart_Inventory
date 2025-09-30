const required = [
  'DATABASE_URL',
  'JWT_SECRET',
  'PORT'
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
  };
}

module.exports = { loadEnv };


