const { PrismaClient } = require('../generated/prisma');
const { logger } = require('./logger');

const prisma = new PrismaClient({
  log: ['error', 'warn']
});

async function connectDb() {
  try {
    await prisma.$connect();
    logger.info('Prisma connected');
  } catch (err) {
    logger.error({ err }, 'Prisma connection failed');
    throw err;
  }
}

async function disconnectDb() {
  await prisma.$disconnect();
}

module.exports = { prisma, connectDb, disconnectDb };


