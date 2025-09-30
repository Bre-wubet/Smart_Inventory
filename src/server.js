const { app } = require('./app');
const { loadEnv, connectDb, disconnectDb, getRedis, logger } = require('./config');
const { startJobs } = require('./jobs');

async function start() {
  const env = loadEnv();
  await connectDb();
  getRedis(env.redisUrl);

  const server = app.listen(env.port, () => {
    logger.info(`Server listening on port ${env.port}`);
  });

  startJobs();

  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down...`);
    server.close(async () => {
      await disconnectDb();
      logger.info('Shutdown complete');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});


