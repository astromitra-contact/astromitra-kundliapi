'use strict';

const axios = require('axios');
const env = require('../../config/env');
const { ProviderError } = require('./providerError');

const geminiClient = axios.create({
  baseURL: env.GEMINI_BASE_URL,
  timeout: 60000,
});

/**
 * Send a prompt to Gemini using a SPECIFIC key/model and return the
 * plain-text answer. The key is passed in explicitly by
 * keyRotation.service.js (decrypted just-in-time from MongoDB) — this
 * function itself never reads GEMINI_API_KEY from the environment, per
 * the "API keys must never live in .env" requirement.
 *
 * Never logs `apiKey` itself; only the outcome (status/message).
 */
async function askGemini({ apiKey, model, promptText }) {
  let response;
  try {
    response = await geminiClient.post(
      `/v1beta/models/${model}:generateContent`,
      {
        contents: [{ role: 'user', parts: [{ text: promptText }] }],
        generationConfig: {
          temperature: 0.7,
          // Gemini 3.x "thinking" tokens are drawn from this same budget,
          // so it needs to be large enough to cover both reasoning AND
          // the actual answer, or responses get cut off mid-sentence.
          maxOutputTokens: 4096,
          // Flash-tier Gemini 3 models can't fully disable thinking, but
          // "low" minimizes how much of the budget above goes to
          // reasoning versus the actual answer text.
          thinkingConfig: { thinkingLevel: 'low' },
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
      }
    );
  } catch (err) {
    const status = err.response && err.response.status;
    const googleMessage =
      (err.response && err.response.data && err.response.data.error && err.response.data.error.message) ||
      err.message;

    // eslint-disable-next-line no-console
    console.error('[ai/gemini] request failed:', status, googleMessage);

    if (status === 429) {
      throw new ProviderError('Gemini rate-limited/quota exceeded.', 'RATE_LIMITED', { status, googleMessage });
    }
    if (status === 401 || status === 403) {
      throw new ProviderError('Gemini API key is invalid or unauthorized.', 'INVALID_KEY', { status, googleMessage });
    }
    if (status === 404) {
      // Usually the configured model was retired/renamed by Google.
      throw new ProviderError('Gemini model not found (likely deprecated).', 'MODEL_NOT_FOUND', {
        status,
        googleMessage,
      });
    }
    if (err.code === 'ECONNABORTED') {
      throw new ProviderError('Gemini request timed out.', 'TIMEOUT', { status, googleMessage });
    }
    throw new ProviderError('Could not reach Gemini.', 'UNAVAILABLE', { status, googleMessage });
  }

  const candidate = response.data && response.data.candidates && response.data.candidates[0];
  const finishReason = candidate && candidate.finishReason;
  const text =
    candidate &&
    candidate.content &&
    Array.isArray(candidate.content.parts) &&
    candidate.content.parts.map((p) => p.text || '').join('').trim();

  if (finishReason === 'MAX_TOKENS') {
    // eslint-disable-next-line no-console
    console.warn('[ai/gemini] Response was truncated (finishReason: MAX_TOKENS).');
  }

  if (!text) {
    // eslint-disable-next-line no-console
    console.warn('[ai/gemini] Empty/unexpected response, finishReason:', finishReason);
    throw new ProviderError('Gemini returned an empty response.', 'EMPTY_RESPONSE', { finishReason });
  }

  return text;
}

module.exports = { askGemini };
