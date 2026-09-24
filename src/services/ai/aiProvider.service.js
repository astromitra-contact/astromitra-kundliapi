'use strict';

const keyRotationService = require('./keyRotation.service');
const AiRequestLog = require('../../models/aiRequestLog.model');
const { isMongoReady } = require('../../utils/mongoStatus');

/**
 * Ask the AI for an answer to `promptText`, transparently trying every
 * configured provider/key (see keyRotation.service.js) until one
 * succeeds. This is the single function chat.service.js calls — it never
 * needs to know about Gemini/Groq/keys/priorities.
 *
 * `kundliId` is only used for the usage log (best-effort, never blocks or
 * fails the actual answer).
 */
async function askAI({ promptText, kundliId }) {
  const startedAt = Date.now();

  try {
    const { text, provider, model, attemptsCount } = await keyRotationService.tryAllProviders(promptText);
    await logRequest({ kundliId, provider, model, success: true, attemptsCount, startedAt });
    return text;
  } catch (err) {
    await logRequest({
      kundliId,
      provider: null,
      model: null,
      success: false,
      errorCode: err.code,
      attemptsCount: (err.details && err.details.attemptsCount) || 0,
      startedAt,
    });
    throw err;
  }
}

async function logRequest({ kundliId, provider, model, success, errorCode, attemptsCount, startedAt }) {
  if (!isMongoReady()) return;
  try {
    await AiRequestLog.create({
      kundliId,
      provider,
      model,
      success,
      errorCode: errorCode || null,
      latencyMs: Date.now() - startedAt,
      attemptsCount,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[aiProvider.service] Failed to write usage log (non-fatal):', err.message);
  }
}

module.exports = { askAI };
