'use strict';

const aiSettingsService = require('../../services/aiSettings.service');

async function get(req, res, next) {
  try {
    const settings = await aiSettingsService.getSettings();
    res.status(200).json({ success: true, data: settings });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { systemPrompt, astrologyInstructions, activeProviderPreference } = req.body;
    const updated = await aiSettingsService.updateSettings({ systemPrompt, astrologyInstructions, activeProviderPreference });
    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

module.exports = { get, update };
