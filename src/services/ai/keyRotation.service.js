'use strict';

const geminiService = require('./gemini.service');
const groqService = require('./groq.service');
const aiProviderKeyService = require('./aiProviderKey.service');

const PROVIDER_ORDER = ['gemini', 'groq'];

const ASK_FN = {
  gemini: geminiService.askGemini,
  groq: groqService.askGroq,
};

/**
 * Try every active, non-cooling-down key across Gemini first then Groq
 * (in priority order within each provider) until one succeeds. This is
 * the ONLY place that decides provider/key order — chat.service.js just
 * calls tryAllProviders() and gets back an answer or a final failure; it
 * never knows which key/provider actually served the request.
 *
 * Returns { text, provider, model, attemptsCount } on success.
 * Throws AppError('ALL_AI_PROVIDERS_FAILED') if every configured key,
 * across every provider, failed.
 */
async function tryAllProviders(promptText) {
  const AppError = require('../../utils/AppError');
  let attemptsCount = 0;
  const failureSummary = [];

  for (const provider of PROVIDER_ORDER) {
    // eslint-disable-next-line no-await-in-loop
    const keys = await aiProviderKeyService.getUsableKeysForProvider(provider);

    for (const key of keys) {
      attemptsCount += 1;
      const askFn = ASK_FN[provider];
      try {
        // eslint-disable-next-line no-await-in-loop
        const text = await askFn({ apiKey: key.rawKey, model: key.model, promptText });
        // eslint-disable-next-line no-await-in-loop
        await aiProviderKeyService.recordSuccess(key.id);
        return { text, provider, model: key.model, attemptsCount };
      } catch (err) {
        const classification = err.classification || 'UNAVAILABLE';
        // eslint-disable-next-line no-await-in-loop
        await aiProviderKeyService.recordFailure(key.id, classification, err.message);
        failureSummary.push(`${provider}/${key.model}: ${classification}`);
        // Deliberately no throw here — fall through to the next key.
        // This is what makes a single bad/rate-limited key invisible to
        // the end user as long as another active key exists anywhere.
      }
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
