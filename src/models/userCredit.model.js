'use strict';

const mongoose = require('mongoose');

/**
 * Per-user daily credit/question ledger for the Chat API.
 *
 * There is deliberately no auth/ownership on `userId` — same as the rest
 * of this project, it is an opaque client-supplied identifier (e.g. a
 * Flutter-generated UUID or device id), not an authenticated account.
 *
 * All fields the spec requires are tracked separately, exactly as named:
 *   normalDailyCredits, normalQuestionsUsed,
 *   rewardCredits, rewardQuestionsUsed, rewardClaimedToday,
 *   creditResetDate
 *
 * `creditResetDate` is a "YYYY-MM-DD" UTC calendar-date string. All daily
 * reset logic (see credit.service.js) compares this against today's UTC
 * date — there is no per-user timezone concept for credits (the birth
 * Kundli's timezone handling is unrelated to this).
 */
const userCreditSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },

    normalDailyCredits: { type: Number, default: 50 },
    normalQuestionsUsed: { type: Number, default: 0 },

    rewardCredits: { type: Number, default: 0 },
    rewardQuestionsUsed: { type: Number, default: 0 },
    rewardClaimedToday: { type: Boolean, default: false },

    creditResetDate: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('UserCredit', userCreditSchema);
