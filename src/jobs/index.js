const { queue: stockReorderQueue } = require('./stockReorder.job');
const { queue: reportGeneratorQueue } = require('./reportGenerator.job');
const { logger } = require('../config');

function startJobs() {
  try {
    logger.info('Starting background jobs...');
    
    // Start stock reorder check job (every 15 minutes)
    stockReorderQueue.add('stock-reorder-check', {}, { 
      repeat: { cron: '*/15 * * * *' },
      removeOnComplete: 10,
      removeOnFail: 5
    });
    
    // Start report generation job (daily at midnight)
    reportGeneratorQueue.add('daily-report', {}, { 
      repeat: { cron: '0 0 * * *' },
      removeOnComplete: 7,
      removeOnFail: 3
    });
    
    logger.info('Background jobs started successfully');
  } catch (error) {
    logger.error('Failed to start background jobs:', error);
    throw error;
  }
}

async function stopJobs() {
  try {
    logger.info('Stopping background jobs...');
    
    // Close all queues gracefully
    await Promise.all([
      stockReorderQueue.close(),
      reportGeneratorQueue.close()
    ]);
    
    logger.info('Background jobs stopped successfully');
  } catch (error) {
    logger.error('Error stopping background jobs:', error);
    throw error;
  }
}

module.exports = { startJobs, stopJobs };


