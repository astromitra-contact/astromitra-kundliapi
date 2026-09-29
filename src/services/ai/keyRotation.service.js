'use strict';

const geminiService = require('./gemini.service');
const groqService = require('./groq.service');
const aiProviderKeyService = require('./aiProviderKey.service');


const ASK_FN = {
  gemini: geminiService.askGemini,
  groq: groqService.askGroq,
};

/**
 * Try every active, non-cooling-down key in strict GLOBAL priority order
 * (1, 2, 3...) across all providers until one succeeds. This allows any
 * provider (Groq, Gemini, etc.) with priority 1 to be tried first.
 *
 * Returns { text, provider, model, attemptsCount } on success.
 * Throws AppError('ALL_AI_PROVIDERS_FAILED') if every configured key failed.
 */
async function tryAllProviders(promptText) {
  const AppError = require('../../utils/AppError');
  let attemptsCount = 0;
  const failureSummary = [];

  const keys = await aiProviderKeyService.getAllUsableKeys();

  for (const key of keys) {
    const askFn = ASK_FN[key.provider];
    if (!askFn) {
      // eslint-disable-next-line no-console
      console.warn(`[keyRotation] Unsupported provider '${key.provider}', skipping.`);
      continue;
    }

    attemptsCount += 1;
    try {
      // eslint-disable-next-line no-await-in-loop
      const text = await askFn({ apiKey: key.rawKey, model: key.model, promptText });
      // eslint-disable-next-line no-await-in-loop
      await aiProviderKeyService.recordSuccess(key.id);
      return { text, provider: key.provider, model: key.model, attemptsCount };
    } catch (err) {
      const classification = err.classification || 'UNAVAILABLE';
      // eslint-disable-next-line no-await-in-loop
      await aiProviderKeyService.recordFailure(key.id, classification, err.message);
      failureSummary.push(`${key.provider}/${key.model} (p${key.priority}): ${classification}`);
      // Deliberately no throw here — fall through to the next key by priority.
      // This is what makes a single bad/rate-limited key invisible to
      // the end user as long as another active key exists anywhere.
    }
  }

  // Every key, across every provider, failed (or none were configured).
  // eslint-disable-next-line no-console
  console.error('[keyRotation] All AI providers/keys failed:', failureSummary.join(' | ') || '(no active keys configured)');

  throw new AppError(
    'The AI service is temporarily unavailable. Please try again shortly.',
    503,
    'ALL_AI_PROVIDERS_FAILED',
    { attemptsCount, failureSummary }
  );
}

module.exports = { tryAllProviders };
