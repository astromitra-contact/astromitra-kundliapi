'use strict';

const adminAuthService = require('../../services/admin/adminAuth.service');

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const { token, expiresIn } = await adminAuthService.login(email, password);
    res.status(200).json({ success: true, token, expiresIn });
  } catch (err) {
    next(err);
  }
}

module.exports = { login };
