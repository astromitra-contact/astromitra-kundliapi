'use strict';

const kundliService = require('../services/kundli.service');

const locationService = require('../services/location.service');

async function generateKundli(req, res, next) {
  try {
    const { name, dateOfBirth, timeOfBirth, birthPlace, userId } = req.body;

    const result = await kundliService.generateKundli({
      name,
      dateOfBirth,
      timeOfBirth,
      birthPlace,
      userId,
    });

    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getTransit(req, res, next) {
  try {
    const { dateTime, latitude, longitude, place } = req.body;

    const result = await kundliService.generateTransit({ dateTime, latitude, longitude, place });

    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function updateKundli(req, res, next) {
  try {
    const { kundliId } = req.params;
    const { name, dateOfBirth, timeOfBirth, birthPlace } = req.body;

    const result = await kundliService.updateKundli(kundliId, {
      name,
      dateOfBirth,
      timeOfBirth,
      birthPlace,
    });

    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function searchPlaces(req, res, next) {
  try {
    const { q } = req.query;
    const places = await locationService.searchPlaces(q);
    res.status(200).json({ success: true, places });
  } catch (err) {
    next(err);
  }
}

async function deleteAccountData(req, res, next) {
  try {
    const { kundliId } = req.params;
    const result = await kundliService.deleteAccountAndKundliData(kundliId);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = { generateKundli, getTransit, updateKundli, searchPlaces, deleteAccountData };

