'use strict';

const mongoose = require('mongoose');

/**
 * One entry per /api/chat/ask call (after credit check passes), recording
 * which provider/key/model actually answered (or that all providers
 * failed). Deliberately minimal — this is NOT a general analytics/logging
 * module, just enough data to answer:
 *   - admin dashboard counts (chat questions, AI requests, daily usage)
 *   - which key/provider is failing, for the rotation system's own
 *     bookkeeping and for admin visibility into key health
 *
 * Not indexed/retained forever by design here — for production scale
 * you'd add a TTL index or periodic archival; out of scope for this pass.
 */
const aiRequestLogSchema = new mongoose.Schema(
  {
    kundliId: { type: String, required: true, index: true },
    provider: { type: String, enum: ['gemini', 'groq'], default: null },
    model: { type: String, default: null },
    success: { type: Boolean, required: true, index: true },
    errorCode: { type: String, default: null },
    latencyMs: { type: Number, default: null },
    attemptsCount: { type: Number, default: 1 }, // how many keys/providers were tried before success/final failure
  },
  { timestamps: true }
);

aiRequestLogSchema.index({ createdAt: 1 });

module.exports = mongoose.model('AiRequestLog', aiRequestLogSchema);
