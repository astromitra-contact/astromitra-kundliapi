'use strict';

const AiSettings = require('../models/aiSettings.model');
const { isMongoReady } = require('../utils/mongoStatus');

const DEFAULT_SYSTEM_PROMPT =
  'You are a knowledgeable, level-headed Vedic (sidereal, Lahiri ayanamsa) astrology assistant inside the AstroMitra app.';

const DEFAULT_ASTROLOGY_INSTRUCTIONS = `- Respond in the exact same language AND script the user used in their question. If they wrote in Romanized/Latin-script Gujarati or Hindi (e.g. "mara lagna su chhe"), reply the same way — Romanized, Latin letters — do NOT switch to native Gujarati/Devanagari script. If they wrote in English, reply in English. Match their input exactly.
- Ground your reasoning internally in the specific JSON data given (natal houses, Rashi, Nakshatra, planetary lords, current transits) — but do NOT explain that reasoning in the answer. The user wants the conclusion, not the methodology.
- Give ONLY the direct, final answer — no house numbers, no planet-by-planet breakdown, no "Transit Focus" or "Favorable Period" style headers/sections, no astrological jargon or technical terms unless the user's question specifically asks for the reasoning.
- If the question concerns timing (e.g. "when will X happen"), give a general timeframe/window in one or two sentences — not certainties, not a detailed transit walkthrough.
- Be honest about uncertainty, but briefly — do not hedge at length.
- Do not give medical, legal, or financial advice; if the question strays into those areas, briefly note that astrology isn't a substitute for professional advice.
- Keep the answer SHORT: 2-4 sentences, around 40-80 words, plain conversational language (not JSON, not bullet points, not bold headers) — like a direct spoken answer from a knowledgeable friend, not a report.
- Write only the final answer itself — do not describe your approach or narrate your own reasoning process (e.g. no "Let's organize the points..." or "Standard practice is to..."). Start directly with the answer.`;

/** Read current settings, seeding the defaults above on first use. */
async function getSettings() {
  if (!isMongoReady()) {
    return {
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      astrologyInstructions: DEFAULT_ASTROLOGY_INSTRUCTIONS,
      activeProviderPreference: 'gemini',
    };
  }

  const doc = await AiSettings.findByIdAndUpdate(
    'singleton',
    {
      $setOnInsert: {
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        astrologyInstructions: DEFAULT_ASTROLOGY_INSTRUCTIONS,
        activeProviderPreference: 'gemini',
      },
    },
    { upsert: true, new: true }
  ).lean();

  return {
    systemPrompt: doc.systemPrompt,
    astrologyInstructions: doc.astrologyInstructions,
    activeProviderPreference: doc.activeProviderPreference,
  };
}

/** Partial update — only the fields provided are changed. */
async function updateSettings(updates) {
  const AppError = require('../utils/AppError');
  if (!isMongoReady()) {
    throw new AppError('AI settings require MongoDB to be configured (MONGODB_URI).', 503, 'STORAGE_REQUIRED');
  }

  const allowed = {};
  if (updates.systemPrompt !== undefined) allowed.systemPrompt = updates.systemPrompt;
  if (updates.astrologyInstructions !== undefined) allowed.astrologyInstructions = updates.astrologyInstructions;
  if (updates.activeProviderPreference !== undefined) allowed.activeProviderPreference = updates.activeProviderPreference;

  // MongoDB rejects an update where the same field appears in both $set
  // and $setOnInsert — so setOnInsertDefaults must only include fields
  // NOT already present in `allowed`.
  const setOnInsertDefaults = {
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    astrologyInstructions: DEFAULT_ASTROLOGY_INSTRUCTIONS,
    activeProviderPreference: 'gemini',
  };
  for (const key of Object.keys(allowed)) {
    delete setOnInsertDefaults[key];
  }

  const doc = await AiSettings.findByIdAndUpdate(
    'singleton',
    { $set: allowed, $setOnInsert: setOnInsertDefaults },
    { upsert: true, new: true }
  ).lean();

  return {
    systemPrompt: doc.systemPrompt,
    astrologyInstructions: doc.astrologyInstructions,
    activeProviderPreference: doc.activeProviderPreference,
  };
}

module.exports = { getSettings, updateSettings, DEFAULT_SYSTEM_PROMPT, DEFAULT_ASTROLOGY_INSTRUCTIONS };
