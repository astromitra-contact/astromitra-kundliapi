'use strict';

const adminAuthService = require('../services/admin/adminAuth.service');
const AppError = require('../utils/AppError');

/**
 * Applied to every /api/admin/* route except POST /api/admin/auth/login.
 * Expects `Authorization: Bearer <jwt>`. On success, attaches req.admin.
 */
function requireAdminAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new AppError('Missing or malformed Authorization header. Expected: Bearer <token>.', 401, 'ADMIN_AUTH_REQUIRED');
    }

    const payload = adminAuthService.verifyToken(token);
    req.admin = payload;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireAdminAuth };
