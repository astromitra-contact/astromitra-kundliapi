'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const env = require('./config/env');
const kundliRoutes = require('./routes/kundli.routes');
const chatRoutes = require('./routes/chat.routes');
const adminRoutes = require('./routes/admin/admin.routes');
const { errorHandler, notFoundHandler } = require('./utils/errorHandler');

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json({ limit: '20kb' }));

  // Global baseline rate limit (in addition to the stricter one on /generate).
  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX * 3,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  app.get('/health', (req, res) => {
    res.status(200).json({ success: true, status: 'ok', service: 'astromitra-kundli-api' });
  });

  app.use('/api/kundli', kundliRoutes);
  app.use('/api/chat', chatRoutes);
  // Admin routes are NOT reachable through the public Kundli/Chat surface
  // — separate router, separate base path, separate JWT auth middleware
  // (see middleware/adminAuth.middleware.js) applied inside admin.routes.js
  // to everything except the login route itself.
  app.use('/api/admin', adminRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
