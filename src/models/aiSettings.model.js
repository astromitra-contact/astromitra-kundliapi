'use strict';

const mongoose = require('mongoose');

/**
 * Singleton settings document — there is intentionally only ever one of
 * these (see aiSettings.service.js, which always upserts/reads a fixed
 * `_id: 'singleton'`). Kept minimal per spec: just enough to let an admin
 * tune the prompt without a code deploy — not a full astrology CMS.
 */
const aiSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'singleton' },
    systemPrompt: { type: String, required: true },
    astrologyInstructions: { type: String, required: true },
    activeProviderPreference: { type: String, enum: ['gemini', 'groq'], default: 'gemini' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AiSettings', aiSettingsSchema);
