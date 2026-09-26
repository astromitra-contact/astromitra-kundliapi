'use strict';

const express = require('express');
const horoscopeController = require('../controllers/horoscope.controller');

const router = express.Router();

// GET /api/horoscope/signs - List all 12 Zodiac signs metadata
router.get('/signs', horoscopeController.getSigns);

// GET /api/horoscope/daily - Get daily horoscope by query (?sign=Aries&kundliId=...&date=YYYY-MM-DD)
router.get('/daily', horoscopeController.getDailyHoroscope);

// POST /api/horoscope/daily - Get daily horoscope via JSON body { sign, kundliId, date }
router.post('/daily', horoscopeController.getDailyHoroscope);

module.exports = router;
