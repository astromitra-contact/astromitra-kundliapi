'use strict';

const axios = require('axios');
const env = require('../../config/env');
const { ProviderError } = require('./providerError');

const groqClient = axios.create({
  baseURL: env.GROQ_BASE_URL,
  timeout: 60000,
});

/**
 * Send a prompt to Groq (OpenAI-compatible Chat Completions API) using a
 * SPECIFIC key/model and return the plain-text answer. Same contract as
 * ai/gemini.service.js — explicit key/model params, never reads from env,
 * throws ProviderError with a classification keyRotation.service.js can
 * act on.
 */
async function askGroq({ apiKey, model, promptText }) {
  let response;
  try {
    response = await groqClient.post(
      '/chat/completions',
      {
        model,
        messages: [{ role: 'user', content: promptText }],
        temperature: 0.7,
        max_completion_tokens: 1024,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );
  } catch (err) {
    const status = err.response && err.response.status;
    const groqMessage =
      (err.response && err.response.data && err.response.data.error && err.response.data.error.message) ||
      err.message;

    // eslint-disable-next-line no-console
    console.error('[ai/groq] request failed:', status, groqMessage);

    if (status === 429) {
      throw new ProviderError('Groq rate-limited/quota exceeded.', 'RATE_LIMITED', { status, groqMessage });
    }
    if (status === 401 || status === 403) {
      throw new ProviderError('Groq API key is invalid or unauthorized.', 'INVALID_KEY', { status, groqMessage });
    }
    if (status === 404) {
      throw new ProviderError('Groq model not found (likely deprecated/renamed).', 'MODEL_NOT_FOUND', {
        status,
        groqMessage,
      });
    }
    if (err.code === 'ECONNABORTED') {
      throw new ProviderError('Groq request timed out.', 'TIMEOUT', { status, groqMessage });
    }
    throw new ProviderError('Could not reach Groq.', 'UNAVAILABLE', { status, groqMessage });
  }

  const choice = response.data && response.data.choices && response.data.choices[0];
  const finishReason = choice && choice.finish_reason;
  const text = choice && choice.message && String(choice.message.content || '').trim();

  if (finishReason === 'length') {
    // eslint-disable-next-line no-console
    console.warn('[ai/groq] Response was truncated (finish_reason: length).');
  }

  if (!text) {
    // eslint-disable-next-line no-console
    console.warn('[ai/groq] Empty/unexpected response, finish_reason:', finishReason);
    throw new ProviderError('Groq returned an empty response.', 'EMPTY_RESPONSE', { finishReason });
  }

  return text;
}

module.exports = { askGroq };
