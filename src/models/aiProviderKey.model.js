'use strict';

const mongoose = require('mongoose');

/**
 * One AI provider API key, encrypted at rest (see utils/crypto.js — the
 * `encryptedKey` field is never a raw usable key by itself; it must be
 * decrypted with ENCRYPTION_KEY before use). Never serialize
 * `encryptedKey` to any admin API response — always return `maskedKey`
 * instead (see admin/aiKey.controller.js).
 *
 * Rotation/fallback logic (keyRotation.service.js) selects keys by:
 *   provider (gemini tried before groq) -> active === true
 *   -> not currently cooling down (cooldownUntil in the past or unset)
 *   -> priority ascending (1 = tried first)
 */
const aiProviderKeySchema = new mongoose.Schema(
  {
    provider: { type: String, enum: ['gemini', 'groq'], required: true, index: true },
    model: { type: String, required: true },
    label: { type: String, default: '' }, // optional admin-facing note, e.g. "Prod key #1"

    encryptedKey: { type: String, required: true },
    keyPreview: { type: String, required: true }, // masked, e.g. "AIza****abcd" — safe to return to admin UI

    priority: { type: Number, required: true, default: 100, index: true }, // lower = tried first
    active: { type: Boolean, default: true, index: true },

    // Rotation/health bookkeeping (requirement 4: "track basic usage/
    // failure status per key", "mark temporarily failed keys with
    // cooldown information", "mark permanently invalid keys as inactive").
    cooldownUntil: { type: Date, default: null }, // set on 429/5xx, cleared on success
    consecutiveFailures: { type: Number, default: 0 },
    lastUsedAt: { type: Date, default: null },
    lastSuccessAt: { type: Date, default: null },
    lastFailureAt: { type: Date, default: null },
    lastFailureReason: { type: String, default: '' },
    totalSuccessCount: { type: Number, default: 0 },
    totalFailureCount: { type: Number, default: 0 },

    invalidatedAt: { type: Date, default: null }, // set when auto-deactivated for being permanently invalid (401/403)
  },
  { timestamps: true }
);

aiProviderKeySchema.index({ provider: 1, active: 1, priority: 1 });
aiProviderKeySchema.index({ active: 1, priority: 1 });

module.exports = mongoose.model('AiProviderKey', aiProviderKeySchema);
