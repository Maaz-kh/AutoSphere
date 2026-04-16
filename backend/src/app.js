const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('./config/database');
const Routes = require('./routes');
const auctionScheduler = require('./jobs/auction-scheduler');

class App {
  constructor() {
    this.app = express();
    this.database = Database;
    this.routes = Routes;
    this.port = process.env.PORT || 3000;
    
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandlers();
  }

  initializeMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
  }

  initializeRoutes() {
    // Health check route
    this.app.get('/health', (req, res) => {
      res.json({
        success: true,
        message: 'AutoSphere API is running',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
      });
    });

    // API routes
    this.app.use('/api', this.routes);

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    });
  }

  initializeErrorHandlers() {
    // Global error handler
    this.app.use((err, req, res, next) => {
      console.error('Global error:', err);

      // Multer errors
      if (err.name === 'MulterError') {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'File too large'
          });
        }
      }

      res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error'
      });
    });
  }

  async initialize() {
    try {
      await this.database.initialize();
      console.log('✅ Application initialized successfully');
    } catch (error) {
      console.error('❌ Application initialization failed:', error);
      throw error;
    }
  }

  async start() {
    try {
      await this.initialize();
      await auctionScheduler.ensureRunning();

      this.server = this.app.listen(this.port, () => {
        this.printStartupInfo();
      });
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  printStartupInfo() {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 AutoSphere API Server`);
    console.log(`${'='.repeat(60)}`);
    console.log(`📍 Server running on: http://localhost:${this.port}`);
    console.log(`📍 Health check: http://localhost:${this.port}/health`);
    console.log(`📍 API Base URL: http://localhost:${this.port}/api`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`${'='.repeat(60)}\n`);
  }

  async stop() {
    auctionScheduler.stop();
    if (this.server) {
      await new Promise((resolve) => {
        this.server.close(resolve);
      });
      await this.database.close();
      console.log('Server stopped successfully');
    }
  }

  getApp() {
    return this.app;
  }
}

module.exports = App;