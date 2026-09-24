'use strict';

const crypto = require('crypto');

const UserCredit = require('../models/userCredit.model');
const AppError = require('../utils/AppError');
const { isMongoReady } = require('../utils/mongoStatus');

// --- Fixed allowance rules (per the spec — not client-configurable) -------
const NORMAL_DAILY_CREDITS = 50;
const MAX_NORMAL_QUESTIONS = 4;
const REWARD_CREDITS = 20;
const MAX_REWARD_QUESTIONS = 2;

function todayUtcDateString() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function randomInt(min, max) {
  return crypto.randomInt(min, max + 1);
}

function requireMongo() {
  if (!isMongoReady()) {
    throw new AppError(
      'The Chat API requires MongoDB to be configured (MONGODB_URI).',
      503,
      'STORAGE_REQUIRED'
    );
  }
}

/**
 * Idempotently ensure this user's ledger reflects "today". Creates a fresh
 * document (50 / 0 / 0 / 0 / false) for a brand-new userId, or resets an
 * existing one whose `creditResetDate` is not today. Does nothing if the
 * user already has a document dated today.
 */
async function ensureFreshDay(userId) {
  const today = todayUtcDateString();

  // Step 1: guarantee a document exists for this userId (first-time users only)
  await UserCredit.findOneAndUpdate(
    { userId },
    {
      $setOnInsert: {
        normalDailyCredits: NORMAL_DAILY_CREDITS,
        normalQuestionsUsed: 0,
        rewardCredits: 0,
        rewardQuestionsUsed: 0,
        rewardClaimedToday: false,
        creditResetDate: today,
      },
    },
    { upsert: true }
  );

  // Step 2: reset it if it exists but is dated before today.
  await UserCredit.updateOne(
    { userId, creditResetDate: { $ne: today } },
    {
      $set: {
        normalDailyCredits: NORMAL_DAILY_CREDITS,
        normalQuestionsUsed: 0,
        rewardCredits: 0,
        rewardQuestionsUsed: 0,
        rewardClaimedToday: false,
        creditResetDate: today,
      },
    }
  );

  return today;
}

/** Read-only current status (after ensuring today's reset has been applied). */
async function getStatus(userId) {
  requireMongo();
  const today = await ensureFreshDay(userId);
  const doc = await UserCredit.findOne({ userId, creditResetDate: today }).lean();
  return summarize(doc);
}

function summarize(doc) {
  if (!doc) {
    return {
      normalDailyCredits: NORMAL_DAILY_CREDITS,
      normalQuestionsUsed: 0,
      rewardCredits: 0,
      rewardQuestionsUsed: 0,
      rewardClaimedToday: false,
      creditResetDate: todayUtcDateString(),
      remainingCredits: NORMAL_DAILY_CREDITS,
      remainingQuestions: MAX_NORMAL_QUESTIONS,
      rewardEligible: false,
    };
  }

  const remainingNormalQuestions = Math.max(0, MAX_NORMAL_QUESTIONS - (doc.normalQuestionsUsed || 0));
  const remainingRewardQuestions = doc.rewardClaimedToday
    ? Math.max(0, MAX_REWARD_QUESTIONS - (doc.rewardQuestionsUsed || 0))
    : 0;

  const totalRemainingQuestions = remainingNormalQuestions + remainingRewardQuestions;

  let normalDailyCredits = Math.max(0, doc.normalDailyCredits || 0);
  let rewardCredits = doc.rewardClaimedToday ? Math.max(0, doc.rewardCredits || 0) : 0;

  // If ALL questions for the day are used up, credits MUST be strictly 0
  if (totalRemainingQuestions === 0) {
    normalDailyCredits = 0;
    rewardCredits = 0;
  }

  const remainingCredits = totalRemainingQuestions === 0
    ? 0
    : normalDailyCredits + rewardCredits;

  return {
    normalDailyCredits,
    normalQuestionsUsed: doc.normalQuestionsUsed || 0,
    rewardCredits,
    rewardQuestionsUsed: doc.rewardQuestionsUsed || 0,
    rewardClaimedToday: Boolean(doc.rewardClaimedToday),
    creditResetDate: doc.creditResetDate,
    remainingCredits: Math.max(0, remainingCredits),
    remainingQuestions: totalRemainingQuestions,
    rewardEligible: !doc.rewardClaimedToday && (doc.normalQuestionsUsed >= MAX_NORMAL_QUESTIONS),
  };
}

/**
 * Dynamic randomized deductions:
 * 1. Initial 50 credits across 4 questions:
 *    - Each question cost is randomized (e.g. 10-13 credits).
 *    - After Question 4, leaves 2 to 4 credits as a realistic leftover balance.
 * 2. Rewarded bonus (+20 credits across 2 questions):
 *    - Question 5 (1st bonus) deducts randomly (e.g. 10-12 credits).
 *    - Question 6 (2nd bonus / final question) wipes all remaining credits to exactly 0!
 */
async function consumeOneQuestion(userId) {
  requireMongo();
  const today = await ensureFreshDay(userId);

  // Fetch current state for this user today
  const current = await UserCredit.findOne({ userId, creditResetDate: today }).lean();

  // 1. Try the normal 50-credit / 4-question allowance
  if (current && current.normalQuestionsUsed < MAX_NORMAL_QUESTIONS) {
    const nextUsed = current.normalQuestionsUsed + 1;
    let newCredits;
    let cost;

    if (nextUsed >= MAX_NORMAL_QUESTIONS) {
      // 4th question leaves a natural 2 to 4 credits remaining
      newCredits = randomInt(2, 4);
      cost = Math.max(1, current.normalDailyCredits - newCredits);
    } else if (nextUsed === 1) {
      cost = randomInt(11, 13);
      newCredits = Math.max(0, current.normalDailyCredits - cost);
    } else if (nextUsed === 2) {
      cost = randomInt(11, 13);
      newCredits = Math.max(0, current.normalDailyCredits - cost);
    } else {
      // 3rd question: leaves around 14 to 17 credits for the 4th question
      cost = randomInt(10, 12);
      newCredits = Math.max(0, current.normalDailyCredits - cost);
    }

    const updated = await UserCredit.findOneAndUpdate(
      {
        userId,
        creditResetDate: today,
        normalQuestionsUsed: current.normalQuestionsUsed,
      },
      {
        $set: {
          normalDailyCredits: newCredits,
          normalQuestionsUsed: nextUsed,
        },
      },
      { new: true }
    );

    if (updated) {
      return { pool: 'normal', cost, ...summarize(updated) };
    }
  }

  // 2. Normal allowance exhausted — try the rewarded-ad pool (20 credits / 2 questions)
  if (
    current &&
    current.rewardClaimedToday &&
    current.rewardQuestionsUsed < MAX_REWARD_QUESTIONS
  ) {
    const nextRewardUsed = current.rewardQuestionsUsed + 1;
    let newRewardCredits;
    let newNormalCredits = current.normalDailyCredits;
    let cost;

    if (nextRewardUsed >= MAX_REWARD_QUESTIONS) {
      // 2nd bonus question (Final question): Wipe all remaining credits to EXACTLY 0!
      newRewardCredits = 0;
      newNormalCredits = 0;
      cost = (current.rewardCredits || 0) + (current.normalDailyCredits || 0);
    } else {
      // 1st bonus question: deduct random 10-12 credits from reward pool
      cost = randomInt(10, 12);
      newRewardCredits = Math.max(0, current.rewardCredits - cost);
    }

    const updated = await UserCredit.findOneAndUpdate(
      {
        userId,
        creditResetDate: today,
        rewardClaimedToday: true,
        rewardQuestionsUsed: current.rewardQuestionsUsed,
      },
      {
        $set: {
          rewardCredits: newRewardCredits,
          normalDailyCredits: newNormalCredits,
          rewardQuestionsUsed: nextRewardUsed,
        },
      },
      { new: true }
    );

    if (updated) {
      return { pool: 'reward', cost, ...summarize(updated) };
    }
  }

  // 3. Nothing left
  const rewardStillAvailable = current && !current.rewardClaimedToday;

  throw new AppError(
    'Daily question limit reached.',
    429,
    'QUESTION_LIMIT_REACHED',
    rewardStillAvailable
      ? { rewardAvailable: true, hint: 'Watch a rewarded ad to unlock 2 more questions (+20 credits).' }
      : { rewardAvailable: false, hint: 'All daily questions used. Credits will reset tomorrow.' }
  );
}

/**
 * Grant the one-per-day rewarded-ad bonus (20 credits / 2 questions).
 * Only allowed once the normal 4-question allowance is exhausted, and only
 * once per UTC day.
 */
async function claimRewardCredits(userId) {
  requireMongo();
  const today = await ensureFreshDay(userId);

  const updated = await UserCredit.findOneAndUpdate(
    {
      userId,
      creditResetDate: today,
      rewardClaimedToday: false,
      normalQuestionsUsed: { $gte: MAX_NORMAL_QUESTIONS },
    },
    { $set: { rewardClaimedToday: true, rewardCredits: REWARD_CREDITS, rewardQuestionsUsed: 0 } },
    { new: true }
  );

  if (updated) {
    return summarize(updated);
  }

  // Figure out *why* it failed, for a clear error.
  const current = await UserCredit.findOne({ userId, creditResetDate: today }).lean();
  if (current && current.rewardClaimedToday) {
    throw new AppError('Rewarded credits already claimed today.', 409, 'REWARD_ALREADY_CLAIMED');
  }
  throw new AppError(
    'The rewarded ad bonus unlocks only after the normal daily question allowance is used up.',
    400,
    'NORMAL_ALLOWANCE_NOT_EXHAUSTED'
  );
}

async function assertCanAsk(userId) {
  requireMongo();
  const today = await ensureFreshDay(userId);
  const current = await UserCredit.findOne({ userId, creditResetDate: today }).lean();

  const canAskNormal = current && (current.normalQuestionsUsed || 0) < MAX_NORMAL_QUESTIONS;
  const canAskReward =
    current &&
    current.rewardClaimedToday &&
    (current.rewardQuestionsUsed || 0) < MAX_REWARD_QUESTIONS;

  if (!canAskNormal && !canAskReward) {
    const rewardStillAvailable = current && !current.rewardClaimedToday;
    throw new AppError(
      'Daily question limit reached.',
      429,
      'QUESTION_LIMIT_REACHED',
      rewardStillAvailable
        ? { rewardAvailable: true, hint: 'Watch a rewarded ad to unlock 2 more questions (+20 credits).' }
        : { rewardAvailable: false, hint: 'All daily questions used. Credits will reset tomorrow.' }
    );
  }
}

module.exports = {
  getStatus,
  assertCanAsk,
  consumeOneQuestion,
  claimRewardCredits,
  NORMAL_DAILY_CREDITS,
  MAX_NORMAL_QUESTIONS,
  REWARD_CREDITS,
  MAX_REWARD_QUESTIONS,
};
