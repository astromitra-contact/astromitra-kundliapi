'use strict';

const KundliResult = require('../../models/kundli.model');
const UserCredit = require('../../models/userCredit.model');
const AiRequestLog = require('../../models/aiRequestLog.model');
const AppError = require('../../utils/AppError');
const { isMongoReady } = require('../../utils/mongoStatus');

function requireMongo() {
  if (!isMongoReady()) {
    throw new AppError('Admin stats require MongoDB to be configured (MONGODB_URI).', 503, 'STORAGE_REQUIRED');
  }
}

/**
 * Dashboard summary: total records + counts for "today" (UTC) — kept
 * intentionally basic per spec ("do not add unnecessary
 * analytics/logging modules"). All-time chat/AI counts come from
 * AiRequestLog (see that model's docstring for why it exists); "today"
 * question counts also cross-check against the live credit ledgers.
 */
async function getDashboardStats() {
  requireMongo();

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const [totalKundliRecords, kundliGeneratedToday, totalChatQuestions, chatQuestionsToday, totalAiRequests, aiRequestsToday, successfulAiRequests, activeCreditUsersToday] =
    await Promise.all([
      KundliResult.countDocuments({}),
      KundliResult.countDocuments({ createdAt: { $gte: todayStart } }),
      AiRequestLog.countDocuments({}),
      AiRequestLog.countDocuments({ createdAt: { $gte: todayStart } }),
      AiRequestLog.countDocuments({}),
      AiRequestLog.countDocuments({ createdAt: { $gte: todayStart } }),
      AiRequestLog.countDocuments({ success: true }),
      UserCredit.countDocuments({ creditResetDate: todayStart.toISOString().slice(0, 10), $or: [{ normalQuestionsUsed: { $gt: 0 } }, { rewardQuestionsUsed: { $gt: 0 } }] }),
    ]);

  return {
    totalKundliRecords,
    kundliGeneratedToday,
    totalChatQuestions,
    chatQuestionsToday,
    totalAiRequests,
    aiRequestsToday,
    aiSuccessRate: totalAiRequests > 0 ? Number(((successfulAiRequests / totalAiRequests) * 100).toFixed(1)) : null,
    activeCreditUsersToday,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Basic daily usage breakdown for the last N days (default 7) — Kundli
 * generations and chat questions per UTC day. Simple aggregation, not a
 * full analytics pipeline.
 */
async function getDailyUsage(days = 7) {
  requireMongo();
  const clampedDays = Math.min(Math.max(parseInt(days, 10) || 7, 1), 90);

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (clampedDays - 1));

  const [kundliByDay, chatByDay] = await Promise.all([
    KundliResult.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    AiRequestLog.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  return {
    days: clampedDays,
    kundliGenerated: kundliByDay.map((d) => ({ date: d._id, count: d.count })),
    chatQuestions: chatByDay.map((d) => ({ date: d._id, count: d.count })),
  };
}

module.exports = { getDashboardStats, getDailyUsage };
