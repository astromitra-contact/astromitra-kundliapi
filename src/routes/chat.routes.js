'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');

const env = require('../config/env');
const chatController = require('../controllers/chat.controller');
const { chatAskRules, chatRewardRules, chatCreditStatusRules, validate } = require('../utils/validators');

const router = express.Router();

// Gemini calls cost money and take longer than the Kundli/Transit math, so
// this endpoint gets its own (same-strength) rate limiter, independent of
// the existing /api/kundli limiter.
const chatLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
  },
});

// Ask a Vedic-astrology question grounded in the user's birth Kundli +
// current transit. Backend deducts credits/questions atomically before
// calling Gemini — see credit.service.js.
router.post('/ask', chatLimiter, chatAskRules, validate, chatController.askQuestion);

// Grant the one-per-day rewarded-ad bonus (20 credits / 2 questions).
// The actual ad SDK/rewarded-ad flow is client-side and out of scope here;
// this is the backend endpoint the Flutter app calls once the ad has
// finished playing, so the credit grant itself is never client-trusted.
router.post('/reward', chatLimiter, chatRewardRules, validate, chatController.claimReward);

// Convenience read-only endpoint so the client can display remaining
// credits/questions without spending a question to find out.
router.get('/credits/:kundliId', chatLimiter, chatCreditStatusRules, validate, chatController.getCreditStatus);

module.exports = router;
