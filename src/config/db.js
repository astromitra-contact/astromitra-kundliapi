'use strict';

const mongoose = require('mongoose');
const env = require('./env');

/**
 * MongoDB is optional in this service — it is used only as a cache for
 * previously generated Kundli results (see kundli.service.js). If no
 * MONGODB_URI is configured, the API still works fully; it simply
 * recalculates on every request instead of reading/writing a cache.
 */
async function connectDatabase() {
  if (!env.MONGODB_ENABLED) {
    // eslint-disable-next-line no-console
    console.warn('[db] MONGODB_URI not set — running without result caching.');
    return null;
  }

  mongoose.connection.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[db] MongoDB connection error:', err.message);
  });

  try {
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 8000,
    });
    // eslint-disable-next-line no-console
    console.log('[db] Connected to MongoDB');
    return mongoose.connection;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[db] Failed to connect to MongoDB, continuing without cache:', err.message);
    return null;
  }
}

module.exports = { connectDatabase };
