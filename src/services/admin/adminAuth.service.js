'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const AppError = require('../../utils/AppError');

/**
 * Single-admin-account design: there is exactly one admin identity,
 * configured via ADMIN_EMAIL + ADMIN_PASSWORD_HASH in .env (a bcrypt
 * hash, never the plaintext password — see README for how to generate
 * one). This matches the rest of this project's "keep it minimal, don't
 * build more than what's needed" approach — a full multi-admin user
 * system was explicitly not requested and isn't needed for one operator.
 */
function requireConfigured() {
  if (!env.ADMIN_AUTH_ENABLED || !env.JWT_ENABLED) {
    throw new AppError(
      'Admin auth requires ADMIN_EMAIL, ADMIN_PASSWORD_HASH, and JWT_SECRET to be configured on the server.',
      503,
      'ADMIN_NOT_CONFIGURED'
    );
  }
}

async function login(email, password) {
  requireConfigured();

  const normalizedInput = String(email || '').trim().toLowerCase();
  const normalizedConfigured = env.ADMIN_EMAIL.trim().toLowerCase();

  if (normalizedInput !== normalizedConfigured) {
    // Same generic message as a wrong password — never reveal whether the
    // email matched, to avoid leaking which detail was wrong.
    throw new AppError('Invalid admin email or password.', 401, 'ADMIN_INVALID_CREDENTIALS');
  }

  const passwordMatches = await bcrypt.compare(String(password || ''), env.ADMIN_PASSWORD_HASH);
  if (!passwordMatches) {
    throw new AppError('Invalid admin email or password.', 401, 'ADMIN_INVALID_CREDENTIALS');
  }

  const token = jwt.sign({ role: 'admin', email: normalizedConfigured }, env.JWT_SECRET, {
    expiresIn: env.ADMIN_JWT_EXPIRES_IN,
  });

  return { token, expiresIn: env.ADMIN_JWT_EXPIRES_IN };
}

function verifyToken(token) {
  requireConfigured();
  try {
    return jwt.verify(token, env.JWT_SECRET);
  } catch (err) {
    throw new AppError('Invalid or expired admin session. Please log in again.', 401, 'ADMIN_SESSION_INVALID');
  }
}

module.exports = { login, verifyToken };
