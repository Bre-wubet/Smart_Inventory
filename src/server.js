const { app } = require('./app');
const { loadEnv, connectDb, disconnectDb, getRedis, logger } = require('./config');
const { startJobs, stopJobs } = require('./jobs');
const { createServer } = require('http');
const { Server } = require('socket.io');

class SmartInventoryServer {
  constructor() {
    this.server = null;
    this.io = null;
    this.isShuttingDown = false;
    this.startTime = Date.now();
  }

  async start() {
    try {
      logger.info('Starting Smart Inventory ERP Server...');
      
      // Load environment variables
      const env = loadEnv();
      
      // Connect to database
      await this.connectDatabase();
      
      // Connect to Redis
      await this.connectRedis(env.redisUrl);
      
      // Create HTTP server
      this.server = createServer(app);
      
      // Initialize Socket.IO for real-time features
      this.io = new Server(this.server, {
        cors: {
          origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
          methods: ['GET', 'POST']
        }
      });
      
      // Setup Socket.IO events
      this.setupSocketIO();
      
      // Start background jobs
      await this.startBackgroundJobs();
      
      // Start server
      await this.startServer(env.port);
      
      // Setup graceful shutdown handlers
      this.setupGracefulShutdown();
      
      logger.info(`🚀 Smart Inventory ERP Server started successfully on port ${env.port}`);
      logger.info(`📊 Environment: ${env.nodeEnv}`);
      logger.info(`🔗 API Documentation: http://localhost:${env.port}/api-docs`);
      
    } catch (error) {
      logger.error('Failed to start server:', error);
      await this.gracefulShutdown('STARTUP_ERROR');
    }
  }

  async connectDatabase() {
    try {
      await connectDb();
      logger.info('✅ Database connected successfully');
    } catch (error) {
      logger.error('❌ Database connection failed:', error);
      throw error;
    }
  }

  async connectRedis(redisUrl) {
    try {
      getRedis(redisUrl);
      logger.info('✅ Redis connected successfully');
    } catch (error) {
      logger.error('❌ Redis connection failed:', error);
      throw error;
    }
  }

  async startBackgroundJobs() {
    try {
      startJobs();
      logger.info('✅ Background jobs started successfully');
    } catch (error) {
      logger.error('❌ Failed to start background jobs:', error);
      throw error;
    }
  }

  async startServer(port) {
    return new Promise((resolve, reject) => {
      this.server.listen(port, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  setupSocketIO() {
    this.io.on('connection', (socket) => {
      logger.info(`Client connected: ${socket.id}`);
      
      // Join tenant-specific rooms
      socket.on('join-tenant', (tenantId) => {
        socket.join(`tenant-${tenantId}`);
        logger.info(`Client ${socket.id} joined tenant ${tenantId}`);
      });
      
      // Handle real-time notifications
      socket.on('subscribe-alerts', (tenantId) => {
        socket.join(`alerts-${tenantId}`);
      });
      
      socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
      });
    });
  }

  setupGracefulShutdown() {
    const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
    
    signals.forEach(signal => {
      process.on(signal, () => {
        logger.info(`${signal} received, initiating graceful shutdown...`);
        this.gracefulShutdown(signal);
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      this.gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      this.gracefulShutdown('UNHANDLED_REJECTION');
    });
  }

  async gracefulShutdown(signal) {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress, ignoring signal');
      return;
    }

    this.isShuttingDown = true;
    const shutdownStart = Date.now();
    
    logger.info(`🔄 Graceful shutdown initiated by ${signal}`);
    
    try {
      // Stop accepting new connections
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(() => {
            logger.info('✅ HTTP server closed');
            resolve();
          });
        });
      }

      // Close Socket.IO connections
      if (this.io) {
        this.io.close(() => {
          logger.info('✅ Socket.IO server closed');
        });
      }

      // Stop background jobs
      await this.stopBackgroundJobs();

      // Disconnect from database
      await this.disconnectDatabase();

      const shutdownTime = Date.now() - shutdownStart;
      logger.info(`✅ Graceful shutdown completed in ${shutdownTime}ms`);
      
      process.exit(signal === 'STARTUP_ERROR' || signal === 'UNCAUGHT_EXCEPTION' || signal === 'UNHANDLED_REJECTION' ? 1 : 0);
      
    } catch (error) {
      logger.error('❌ Error during graceful shutdown:', error);
      process.exit(1);
    }
  }

  async stopBackgroundJobs() {
    try {
      stopJobs();
      logger.info('✅ Background jobs stopped');
    } catch (error) {
      logger.error('❌ Error stopping background jobs:', error);
    }
  }

  async disconnectDatabase() {
    try {
      await disconnectDb();
      logger.info('✅ Database disconnected');
    } catch (error) {
      logger.error('❌ Error disconnecting from database:', error);
    }
  }

  // Health check method
  getHealthStatus() {
    return {
      status: 'healthy',
      uptime: Date.now() - this.startTime,
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
      isShuttingDown: this.isShuttingDown
    };
  }
}

// Create and start server instance
const server = new SmartInventoryServer();

// Start the server
server.start().catch((error) => {
  logger.error('Failed to start Smart Inventory ERP Server:', error);
  process.exit(1);
});

module.exports = { SmartInventoryServer };


