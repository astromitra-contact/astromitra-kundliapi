'use strict';

require('dotenv').config();

/**
 * Centralized environment configuration.
 * Fails fast at startup if required variables are missing, rather than
 * failing confusingly deep inside a request handler later.
 */
const required = ['GEONAMES_USERNAME'];

const missing = required.filter((key) => !process.env[key] || process.env[key].trim() === '');

if (missing.length > 0) {
  // eslint-disable-next-line no-console
  console.error(
    `[config] Missing required environment variable(s): ${missing.join(', ')}. ` +
      'Copy .env.example to .env and fill in the values before starting the server.'
  );
  process.exit(1);
}

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 3000,

  GEONAMES_USERNAME: process.env.GEONAMES_USERNAME,
  GEONAMES_BASE_URL: process.env.GEONAMES_BASE_URL || 'http://api.geonames.org',

  MONGODB_URI: process.env.MONGODB_URI || '',
  MONGODB_ENABLED: Boolean(process.env.MONGODB_URI && process.env.MONGODB_URI.trim() !== ''),

  // Optional — only required for the /api/chat/* endpoints. Existing
  // Kundli/Transit endpoints do not depend on this. If unset, chat
  // endpoints return a clear 503 GEMINI_NOT_CONFIGURED instead of the
  // server failing to start.
  //
  // NOTE ON MIGRATION: as of the admin/AI-key-management update, AI
  // provider keys live encrypted in MongoDB (AiProviderKey), not in this
  // .env file — per the "never store API keys in .env" requirement.
  // GEMINI_API_KEY below is kept ONLY as a one-time migration source: if
  // set and MongoDB has zero Gemini keys configured yet, server.js seeds
  // one encrypted DB record from it at startup (see
  // aiProviderKey.service.js#seedFromEnvIfEmpty), logs that it did so, and
  // you should then remove it from .env — add/rotate all keys via the
  // admin API from that point on.
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_ENABLED: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== ''),
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
  GEMINI_BASE_URL: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',

  // Groq — same migration note as Gemini above.
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',
  GROQ_MODEL: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  GROQ_BASE_URL: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',

  // Encryption key for AI provider API keys stored in MongoDB (AES-256-GCM
  // — see utils/crypto.js). Required for any AI-key admin operation or for
  // the chat pipeline to decrypt a stored key before calling a provider.
  // Not in the hard-required startup list (keeps existing Kundli/Transit
  // endpoints working even if unset) — operations that need it return a
  // clear 503 ENCRYPTION_NOT_CONFIGURED instead.
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || '',
  ENCRYPTION_ENABLED: Boolean(process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.trim() !== ''),

  // Admin authentication (POST /api/admin/auth/login + JWT bearer on all
  // other /api/admin/* routes). ADMIN_PASSWORD_HASH is a bcrypt hash, not
  // a plaintext password — see README for how to generate one. Optional
  // at startup; admin routes return 503 ADMIN_NOT_CONFIGURED if unset.
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || '',
  ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH || '',
  ADMIN_AUTH_ENABLED: Boolean(
    process.env.ADMIN_EMAIL &&
      process.env.ADMIN_EMAIL.trim() !== '' &&
      process.env.ADMIN_PASSWORD_HASH &&
      process.env.ADMIN_PASSWORD_HASH.trim() !== ''
  ),
  JWT_SECRET: process.env.JWT_SECRET || '',
  JWT_ENABLED: Boolean(process.env.JWT_SECRET && process.env.JWT_SECRET.trim() !== ''),
  ADMIN_JWT_EXPIRES_IN: process.env.ADMIN_JWT_EXPIRES_IN || '12h',

  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX, 10) || 60,

  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
};

module.exports = env;
