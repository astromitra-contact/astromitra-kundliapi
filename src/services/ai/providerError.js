'use strict';

/**
 * Thrown by ai/gemini.service.js and ai/groq.service.js instead of raw
 * axios errors, so keyRotation.service.js can react consistently across
 * providers without needing to know each provider's specific HTTP/error
 * shape.
 *
 * `classification` drives the rotation logic:
 *   - RATE_LIMITED / UNAVAILABLE / TIMEOUT / EMPTY_RESPONSE: transient —
 *     put this key on cooldown, try the next one.
 *   - INVALID_KEY / MODEL_NOT_FOUND: not transient — this specific key
 *     (or its configured model) is broken and retrying it won't help, so
 *     keyRotation.service.js deactivates it (`invalidatedAt`) and moves on
 *     without waiting for a cooldown to expire.
 */
class ProviderError extends Error {
  constructor(message, classification, details = {}) {
    super(message);
    this.name = 'ProviderError';
    this.classification = classification;
    this.details = details;
  }
}

module.exports = { ProviderError };
