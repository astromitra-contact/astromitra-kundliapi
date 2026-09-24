'use strict';

const env = require('./config/env');
const createApp = require('./app');
const { connectDatabase } = require('./config/db');
const aiProviderKeyService = require('./services/ai/aiProviderKey.service');

async function start() {
  await connectDatabase();

  // One-time convenience migration: if GEMINI_API_KEY/GROQ_API_KEY are
  // still set in .env (pre-admin-panel design) and MongoDB has zero keys
  // for that provider, seed an encrypted DB record from them so existing
  // chat functionality keeps working immediately after this upgrade. Logs
  // what it did; safe/no-op on every subsequent restart. See
  // aiProviderKey.service.js#seedFromEnvIfEmpty for details.
  await aiProviderKeyService.seedFromEnvIfEmpty().catch((err) => {
    // eslint-disable-next-line no-console
    console.warn('[server] AI key env migration skipped:', err.message);
  });

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] AstroMitra Kundli API listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = (signal) => {
    // eslint-disable-next-line no-console
    console.log(`[server] Received ${signal}, shutting down...`);
    server.close(() => process.exit(0));
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[server] Fatal startup error:', err);
  process.exit(1);
});
