'use strict';

const mongoose = require('mongoose');
const KundliResult = require('../../models/kundli.model');
const UserCredit = require('../../models/userCredit.model');
const AppError = require('../../utils/AppError');
const { isMongoReady } = require('../../utils/mongoStatus');

function requireMongo() {
  if (!isMongoReady()) {
    throw new AppError('Admin Kundli management requires MongoDB to be configured (MONGODB_URI).', 503, 'STORAGE_REQUIRED');
  }
}

function toSummaryJson(doc) {
  return {
    kundliId: String(doc._id),
    name: doc.requestInput && doc.requestInput.name,
    dateOfBirth: doc.requestInput && doc.requestInput.dateOfBirth,
    birthPlace: doc.requestInput && doc.requestInput.birthPlace,
    active: doc.active !== false,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * List/search Kundli records. `search` matches (case-insensitive) against
 * name or birthPlace; an exact-length valid ObjectId in `search` is also
 * tried directly against kundliId, per spec ("search by
 * kundliId/name/birthPlace").
 */
async function listKundlis({ search, page = 1, limit = 20 } = {}) {
  requireMongo();

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  const filter = {};
  if (search && search.trim()) {
    const term = search.trim();
    const or = [
      { 'requestInput.name': { $regex: term, $options: 'i' } },
      { 'requestInput.birthPlace': { $regex: term, $options: 'i' } },
    ];
    if (mongoose.Types.ObjectId.isValid(term)) {
      or.push({ _id: term });
    }
    filter.$or = or;
  }

  const [docs, total] = await Promise.all([
    KundliResult.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    KundliResult.countDocuments(filter),
  ]);

  return {
    results: docs.map(toSummaryJson),
    page: pageNum,
    limit: limitNum,
    total,
    totalPages: Math.ceil(total / limitNum) || 1,
  };
}

/** Full detail view: Kundli record + its credit ledger, for one kundliId. */
async function getKundliDetail(kundliId) {
  requireMongo();
  if (!mongoose.Types.ObjectId.isValid(kundliId)) {
    throw new AppError('Invalid kundliId.', 400, 'INVALID_ID');
  }

  const doc = await KundliResult.findById(kundliId).lean();
  if (!doc) {
    throw new AppError('No Kundli found with this kundliId.', 404, 'KUNDLI_NOT_FOUND');
  }

  const creditDoc = await UserCredit.findOne({ userId: kundliId }).lean();

  return {
    kundliId: String(doc._id),
    active: doc.active !== false,
    requestInput: doc.requestInput,
    result: doc.result,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    creditStatus: creditDoc
      ? {
          normalDailyCredits: creditDoc.normalDailyCredits,
          normalQuestionsUsed: creditDoc.normalQuestionsUsed,
          rewardCredits: creditDoc.rewardCredits,
          rewardQuestionsUsed: creditDoc.rewardQuestionsUsed,
          rewardClaimedToday: creditDoc.rewardClaimedToday,
          creditResetDate: creditDoc.creditResetDate,
        }
      : null,
  };
}

/** Toggle active/inactive — inactive Kundlis are refused by /api/chat/ask. */
async function setActive(kundliId, active) {
  requireMongo();
  if (!mongoose.Types.ObjectId.isValid(kundliId)) {
    throw new AppError('Invalid kundliId.', 400, 'INVALID_ID');
  }

  const doc = await KundliResult.findByIdAndUpdate(kundliId, { $set: { active: Boolean(active) } }, { new: true }).lean();
  if (!doc) {
    throw new AppError('No Kundli found with this kundliId.', 404, 'KUNDLI_NOT_FOUND');
  }
  return toSummaryJson(doc);
}

/** Permanently delete a Kundli record (and its credit ledger, if any). */
async function deleteKundli(kundliId) {
  requireMongo();
  if (!mongoose.Types.ObjectId.isValid(kundliId)) {
    throw new AppError('Invalid kundliId.', 400, 'INVALID_ID');
  }

  const doc = await KundliResult.findByIdAndDelete(kundliId);
  if (!doc) {
    throw new AppError('No Kundli found with this kundliId.', 404, 'KUNDLI_NOT_FOUND');
  }

  await UserCredit.deleteOne({ userId: kundliId });

  return { deleted: true, kundliId };
}

module.exports = { listKundlis, getKundliDetail, setActive, deleteKundli };
