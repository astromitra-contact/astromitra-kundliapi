'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');

const env = require('../config/env');
const kundliController = require('../controllers/kundli.controller');
const { kundliGenerateRules, transitRules, updateKundliRules, validate } = require('../utils/validators');

const router = express.Router();

// Rate limiting scoped to this (only) compute-heavy endpoint.
const generateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
  },
});

router.get('/places', kundliController.searchPlaces);

router.post('/generate', generateLimiter, kundliGenerateRules, validate, kundliController.generateKundli);

// Current (or any given moment's) planetary transit / Gochar positions.
router.post('/transit', generateLimiter, transitRules, validate, kundliController.getTransit);

// Partial update of a previously generated Kundli's birth details
// (name / dateOfBirth / timeOfBirth / birthPlace — any subset), fully
// recalculated. Requires MongoDB (the record must exist to update).
router.patch('/:kundliId', generateLimiter, updateKundliRules, validate, kundliController.updateKundli);

// Full wipe of all Kundli records, UserCredit records, and AI logs associated with this id
router.delete('/:kundliId', kundliController.deleteAccountData);

module.exports = router;
