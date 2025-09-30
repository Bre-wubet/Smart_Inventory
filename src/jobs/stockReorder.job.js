const Queue = require('bull');
const { prisma } = require('../config/db');
const { logger } = require('../config/logger');

const queue = new Queue('stock-reorder');

queue.process(async () => {
  // placeholder logic
  const lowStocks = await prisma.stock.findMany({
    where: { quantity: { lt: 1 } },
    take: 10
  });
  logger.info({ count: lowStocks.length }, 'Checked low stock');
});

module.exports = { queue };


