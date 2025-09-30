const Queue = require('bull');
const { logger } = require('../config/logger');

const queue = new Queue('report-generator');

queue.process(async () => {
  // placeholder reporting
  logger.info('Generated daily report');
});

module.exports = { queue };


