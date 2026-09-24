'use strict';

const kundliService = require('./kundli.service');
const creditService = require('./credit.service');
const aiProviderService = require('./ai/aiProvider.service');
const aiSettingsService = require('./aiSettings.service');
const AppError = require('../utils/AppError');

/**
 * Structured Vedic-astrology prompt: birth chart + current transit + the
 * user's question + interpretation instructions. The instructions/system
 * prompt text itself comes from aiSettings.service.js (admin-editable in
 * MongoDB) rather than being hardcoded here, so an admin can tune wording
 * without a code deploy — falls back to sensible built-in defaults if
 * MongoDB/settings aren't configured.
 */
async function buildPrompt({ birthKundli, transit, question }) {
  const settings = await aiSettingsService.getSettings();

  return `${settings.systemPrompt}

You will be given:
1. The user's BIRTH KUNDLI (natal chart) as JSON — sidereal positions, Whole-Sign houses, Rashi/Nakshatra for the Ascendant and each graha.
2. The CURRENT TRANSIT (Gochar) chart as JSON — where each graha is positioned right now, calculated relative to the same birth location.
3. The user's QUESTION in their own words.

=== BIRTH KUNDLI (JSON) ===
${JSON.stringify(birthKundli, null, 2)}

=== CURRENT TRANSIT / GOCHAR (JSON) ===
${JSON.stringify(transit, null, 2)}

=== USER QUESTION ===
${question}

=== INSTRUCTIONS ===
${settings.astrologyInstructions}`;
}

/**
 * POST /api/chat/ask orchestration.
 *
 * Order of operations:
 * 1. Pre-flight check: ensure the user has remaining questions / credits before doing heavy work
 *    (via assertCanAsk).
 * 2. Retrieve Kundli chart and generate transit chart.
 * 3. Call AI provider to generate the response.
 * 4. Deduct credits & calculate question count ONLY after the AI produces a complete, successful answer.
 *    If any error occurs (AI provider down, network timeout, invalid chart), credits and questions
 *    remain strictly untouched.
 */
async function askQuestion({ kundliId, question }) {
  // 1. Check eligibility first without deducting credits or questions.
  await creditService.assertCanAsk(kundliId);

  // 2. Birth Kundli, from MongoDB (via the existing Kundli service — no
  //    Swiss Ephemeris logic is duplicated here).
  const kundliDoc = await kundliService.getKundliById(kundliId);
  if (!kundliDoc) {
    throw new AppError(
      `No Kundli found with kundliId "${kundliId}". Check the id returned by POST /api/kundli/generate.`,
      404,
      'KUNDLI_NOT_FOUND'
    );
  }
  if (kundliDoc.active === false) {
    throw new AppError(
      'This Kundli has been deactivated by an administrator and cannot be used for chat questions.',
      403,
      'KUNDLI_INACTIVE'
    );
  }
  const birthKundli = kundliDoc.result;

  // 3. Current transit, relative to the birth location, via the existing
  //    Transit service (again: no duplicated ephemeris calculation).
  const transit = await kundliService.generateTransit({
    latitude: birthKundli.location.latitude,
    longitude: birthKundli.location.longitude,
  });

  // 4. Build the structured prompt and ask the AI (Gemini -> Groq fallback,
  //    fully transparent to this function).
  const prompt = await buildPrompt({ birthKundli, transit, question });
  const answer = await aiProviderService.askAI({ promptText: prompt, kundliId });

  if (!answer || typeof answer !== 'string' || !answer.trim()) {
    throw new AppError(
      'No response received from AI service. Please try again.',
      502,
      'AI_EMPTY_RESPONSE'
    );
  }

  // 5. Credits & questions are ONLY consumed when a complete and valid answer is successfully generated.
  const usage = await creditService.consumeOneQuestion(kundliId);

  return {
    answer,
    remainingCredits: usage.remainingCredits,
    remainingQuestions: usage.remainingQuestions,
  };
}

async function claimReward({ kundliId }) {
  return creditService.claimRewardCredits(kundliId);
}

async function getCreditStatus({ kundliId }) {
  return creditService.getStatus(kundliId);
}

module.exports = { askQuestion, claimReward, getCreditStatus };
