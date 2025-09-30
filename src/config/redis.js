const { createClient } = require('redis');
const { logger } = require('./logger');

let client;

function getRedis(url) {
  if (client) return client;
  client = createClient({ url });
  client.on('error', (err) => logger.error({ err }, 'Redis Client Error'));
  client.on('connect', () => logger.info('Redis connected'));
  client.connect().catch((err) => logger.error({ err }, 'Redis connect failed'));
  return client;
}

module.exports = { getRedis };


