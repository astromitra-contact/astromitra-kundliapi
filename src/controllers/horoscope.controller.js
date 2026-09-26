'use strict';

const horoscopeService = require('../services/horoscope.service');

async function getDailyHoroscope(req, res, next) {
  try {
    const sign = req.query.sign || req.body.sign || req.query.rashi || req.body.rashi;
    const kundliId = req.query.kundliId || req.body.kundliId;
    const date = req.query.date || req.body.date;

    const data = await horoscopeService.getDailyHoroscope({
      sign,
      kundliId,
      date,
    });

    res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

async function getSigns(req, res, next) {
  try {
    const signs = horoscopeService.getAllSigns();
    res.status(200).json({
      success: true,
      signs,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getDailyHoroscope,
  getSigns,
};
