'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');

const { requireAdminAuth } = require('../../middleware/adminAuth.middleware');

const adminAuthController = require('../../controllers/admin/adminAuth.controller');
const adminStatsController = require('../../controllers/admin/adminStats.controller');
const adminKundliController = require('../../controllers/admin/adminKundli.controller');
const adminAiKeyController = require('../../controllers/admin/adminAiKey.controller');
const adminAiSettingsController = require('../../controllers/admin/adminAiSettings.controller');

const {
  validate,
  adminLoginRules,
  listKundliRules,
  kundliIdParamRules,
  setActiveRules,
  dailyUsageRules,
  createAiKeyRules,
  updateAiKeyRules,
  idParamRules,
  listAiKeyRules,
  updateAiSettingsRules,
} = require('../../utils/adminValidators');

const router = express.Router();

// Strict limiter on login specifically — this is the one route an
// attacker could brute-force, since it's the only unauthenticated one.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Try again later.' } },
});

// --- Public (this router only) ---------------------------------------
router.post('/auth/login', loginLimiter, adminLoginRules, validate, adminAuthController.login);

// --- Everything below requires a valid admin JWT ------------------------
router.use(requireAdminAuth);

// Dashboard / stats
router.get('/stats/dashboard', adminStatsController.getDashboard);
router.get('/stats/daily', dailyUsageRules, validate, adminStatsController.getDailyUsage);

// Kundli / "user" management (kundliId is the sole reference — no
// separate User model, per spec)
router.get('/kundlis', listKundliRules, validate, adminKundliController.list);
router.get('/kundlis/:kundliId', kundliIdParamRules, validate, adminKundliController.getDetail);
router.patch('/kundlis/:kundliId/active', setActiveRules, validate, adminKundliController.setActive);
router.delete('/kundlis/:kundliId', kundliIdParamRules, validate, adminKundliController.remove);

// AI provider key management (Gemini/Groq) — always masked in responses
router.get('/ai-keys', listAiKeyRules, validate, adminAiKeyController.list);
router.post('/ai-keys', createAiKeyRules, validate, adminAiKeyController.create);
router.patch('/ai-keys/:id', updateAiKeyRules, validate, adminAiKeyController.update);
router.delete('/ai-keys/:id', idParamRules, validate, adminAiKeyController.remove);

// AI prompt settings
router.get('/ai-settings', adminAiSettingsController.get);
router.patch('/ai-settings', updateAiSettingsRules, validate, adminAiSettingsController.update);

module.exports = router;
