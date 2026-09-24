'use strict';

const mongoose = require('mongoose');

const locationService = require('./location.service');
const timezoneService = require('./timezone.service');
const astrologyService = require('./astrology.service');
const KundliResult = require('../models/kundli.model');
const AppError = require('../utils/AppError');
const { isMongoReady } = require('../utils/mongoStatus');

// Standard convention used across Vedic astrology software when the exact
// birth time is unknown: noon local time. Ascendant/Houses derived from an
// assumed time are flagged as approximate in the response (`timeAccuracy`)
// rather than presented as if they were precise.
const DEFAULT_UNKNOWN_TIME = '12:00';

/**
 * Pure calculation pipeline: validated input -> GeoNames -> timezone
 * conversion -> Swiss Ephemeris -> structured Kundli JSON. No database
 * reads or writes happen here — this is shared, unchanged, by both
 * generateKundli() (creates a new record) and updateKundli() (recalculates
 * an existing record in place), so there is exactly one calculation code
 * path and no risk of the two drifting apart.
 */
async function computeKundliResult({ name, dateOfBirth, birthPlace, timeOfBirthRaw }) {
  const timeProvided = Boolean(timeOfBirthRaw);
  const timeOfBirth = timeProvided ? timeOfBirthRaw : DEFAULT_UNKNOWN_TIME;

  // 1. Resolve birth place -> lat/lon/timezone via GeoNames.
  const location = await locationService.resolvePlace(birthPlace);

  // 2. Convert local birth date/time to an exact UTC instant (DST-aware).
  const converted = timezoneService.localToUtc(dateOfBirth, timeOfBirth, location.timezone);

  // 3. Run Swiss Ephemeris sidereal calculations.
  const chart = astrologyService.calculateKundli({
    utcDate: converted.utcDate,
    latitude: location.latitude,
    longitude: location.longitude,
  });

  const result = {
    birthDetails: {
      name,
      dateOfBirth,
      timeOfBirth: timeProvided ? timeOfBirth : null,
      birthPlace,
    },
    timeAccuracy: {
      isExact: timeProvided,
      timeUsedForCalculation: timeOfBirth,
      note: timeProvided
        ? 'Exact birth time provided — Ascendant, Houses, and Moon position are precise.'
        : 'Exact birth time was not provided. Noon (12:00) local time was used by default. ' +
          'The Ascendant (Lagna), 12 Houses, and planetary house placements may be INACCURATE, ' +
          "since the Lagna changes roughly every two hours. The Moon's Rashi/Nakshatra could " +
          'also shift if the actual birth time is near a sign-change boundary. Sun and ' +
          "slower-moving planets' Rashi remain reliable regardless of the exact time.",
    },
    location: {
      city: location.city,
      state: location.state || null,
      country: location.country,
      latitude: location.latitude,
      longitude: location.longitude,
      timezone: location.timezone,
    },
    timeConversion: {
      localIso: converted.localIso,
      utcIso: converted.utcIso,
      utcOffsetMinutes: converted.utcOffsetMinutes,
      isDST: converted.isDST,
      julianDayUT: chart.julianDayUT,
    },
    calculationSettings: chart.calculationSettings,
    lagna: chart.lagna,
    houses: chart.houses,
    planets: chart.planets,
    nakshatras: chart.nakshatras,
    generatedAt: new Date().toISOString(),
  };

  return { timeProvided, timeOfBirth, result };
}

/**
 * Generate a brand-new Kundli. Always creates its own new MongoDB document
 * (when MongoDB is configured) with its own stable `kundliId` — never
 * reuses/overwrites another record, even if the birth details are
 * identical to a previous request.
 */
async function generateKundli(input) {
  const { name, dateOfBirth, birthPlace } = input;

  const { timeOfBirth, result } = await computeKundliResult({
    name,
    dateOfBirth,
    birthPlace,
    timeOfBirthRaw: input.timeOfBirth,
  });

  let kundliId = null;
  let stored = false;

  if (isMongoReady()) {
    try {
      // `userId` is optional and purely additive: existing callers that
      // never send it behave exactly as before (field simply stays unset).
      // When present, it lets /api/chat/ask later look up "this user's"
      // most recently generated Kundli without needing an auth system.
      const doc = await KundliResult.create({
        userId: input.userId || undefined,
        requestInput: { name, dateOfBirth, timeOfBirth, birthPlace },
        result,
      });
      kundliId = String(doc._id);
      stored = true;
    } catch (err) {
      // Persistence is best-effort; never fail the request because of it.
      // eslint-disable-next-line no-console
      console.warn('[kundli.service] failed to save record:', err.message);
    }
  }

  return { ...result, kundliId, stored };
}

/**
 * Fetch the most recently generated Kundli for a given userId (used by the
 * Chat API — see chat.service.js — as a fallback when no specific
 * `kundliId` is given). Returns null if MongoDB isn't configured, or no
 * Kundli has been generated with this userId yet.
 */
async function getLatestKundliForUser(userId) {
  if (!isMongoReady()) return null;
  const doc = await KundliResult.findOne({ userId }).sort({ createdAt: -1 }).lean();
  return doc || null;
}

/**
 * Fetch one specific Kundli record by its own id (the `kundliId` returned
 * by /api/kundli/generate). This is the precise way to pick a chart — no
 * "most recent" guessing — used by the Chat API when the caller supplies
 * `kundliId` directly. Returns null (not a thrown error) for an invalid or
 * unknown id, so callers can decide how to report that.
 */
async function getKundliById(kundliId) {
  if (!isMongoReady()) return null;
  if (!mongoose.Types.ObjectId.isValid(kundliId)) return null;
  const doc = await KundliResult.findById(kundliId).lean();
  return doc || null;
}

/**
 * Current/any-moment planetary transit (Gochar). No persistence — a
 * transit chart is time-sensitive by definition and would be stale
 * immediately.
 *
 * `dateTime` defaults to "right now" (server clock, in UTC) if omitted.
 * Location is optional: pass either `latitude`+`longitude`, or a free-text
 * `place` (resolved via GeoNames, same as the birth endpoint), or neither
 * (planet positions only, no Lagna/Houses).
 */
async function generateTransit(input = {}) {
  const dateTime = input.dateTime ? new Date(input.dateTime) : new Date();

  if (Number.isNaN(dateTime.getTime())) {
    throw new AppError('Invalid dateTime supplied.', 400, 'INVALID_DATETIME');
  }

  let latitude = typeof input.latitude === 'number' ? input.latitude : undefined;
  let longitude = typeof input.longitude === 'number' ? input.longitude : undefined;
  let resolvedLocation = null;

  if (input.place && (latitude === undefined || longitude === undefined)) {
    resolvedLocation = await locationService.resolvePlace(input.place);
    latitude = resolvedLocation.latitude;
    longitude = resolvedLocation.longitude;
  }

  const chart = astrologyService.calculateTransit({ utcDate: dateTime, latitude, longitude });

  return {
    transitDateTimeUTC: dateTime.toISOString(),
    location: resolvedLocation
      ? {
          city: resolvedLocation.city,
          state: resolvedLocation.state || null,
          country: resolvedLocation.country,
          latitude: resolvedLocation.latitude,
          longitude: resolvedLocation.longitude,
        }
      : latitude !== undefined
      ? { latitude, longitude }
      : null,
    calculationSettings: chart.calculationSettings,
    lagna: chart.lagna,
    houses: chart.houses,
    planets: chart.planets,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Update an existing Kundli's stored input (name / DOB / time / place — any
 * subset) and recalculate the full chart from scratch, IN PLACE on the same
 * document (`kundliId` never changes). Requires MongoDB, since the original
 * record must exist to merge partial updates against and to be identified
 * by kundliId. There is no auth/ownership on a kundliId (no user accounts
 * in this service) — treat it like a share-link id.
 */
async function updateKundli(kundliId, partialInput = {}) {
  if (!isMongoReady()) {
    throw new AppError(
      'Updating a Kundli requires MongoDB to be configured (MONGODB_URI).',
      503,
      'STORAGE_REQUIRED'
    );
  }

  if (!mongoose.Types.ObjectId.isValid(kundliId)) {
    throw new AppError('Invalid kundliId.', 400, 'INVALID_ID');
  }

  const existing = await KundliResult.findById(kundliId).lean();
  if (!existing) {
    throw new AppError('No Kundli found with this kundliId.', 404, 'KUNDLI_NOT_FOUND');
  }

  // Merge: any field not sent in the request keeps its previous value.
  const merged = {
    name: partialInput.name ?? existing.requestInput.name,
    dateOfBirth: partialInput.dateOfBirth ?? existing.requestInput.dateOfBirth,
    timeOfBirth:
      partialInput.timeOfBirth !== undefined ? partialInput.timeOfBirth : existing.requestInput.timeOfBirth,
    birthPlace: partialInput.birthPlace ?? existing.requestInput.birthPlace,
  };

  // Recalculate fully via the shared pure pipeline (fresh GeoNames lookup
  // if birthPlace changed, fresh ephemeris calculation regardless).
  const { timeOfBirth, result } = await computeKundliResult({
    name: merged.name,
    dateOfBirth: merged.dateOfBirth,
    birthPlace: merged.birthPlace,
    timeOfBirthRaw: merged.timeOfBirth,
  });

  // Update the SAME document in place (same _id/kundliId) — no other
  // document's uniqueness is touched, since records are no longer
  // deduplicated by content.
  await KundliResult.findByIdAndUpdate(kundliId, {
    requestInput: { name: merged.name, dateOfBirth: merged.dateOfBirth, timeOfBirth, birthPlace: merged.birthPlace },
    result,
  });

  return { ...result, kundliId, stored: true };
}

/**
 * Permanently delete all account data and all referenced models in MongoDB:
 * - KundliResult (all records matching this kundliId or userId)
 * - UserCredit (all records matching this userId / kundliId)
 * - AiRequestLog (all logs matching this kundliId)
 */
async function deleteAccountAndKundliData(identifier) {
  if (!isMongoReady()) {
    return { deleted: true, reason: 'mongo_not_configured' };
  }

  if (!identifier || typeof identifier !== 'string') {
    throw new AppError('Invalid identifier provided for account deletion.', 400, 'INVALID_ID');
  }

  const cleanId = identifier.trim();
  const isObjectId = mongoose.Types.ObjectId.isValid(cleanId);

  // Find all Kundli documents matching as _id or as userId
  const query = isObjectId
    ? { $or: [{ _id: cleanId }, { userId: cleanId }] }
    : { userId: cleanId };

  const matchedKundlis = await KundliResult.find(query).lean();

  const kundliIds = matchedKundlis.map((k) => String(k._id));
  if (isObjectId && !kundliIds.includes(cleanId)) {
    kundliIds.push(cleanId);
  }

  const userIds = matchedKundlis.map((k) => k.userId).filter(Boolean);
  if (!userIds.includes(cleanId)) {
    userIds.push(cleanId);
  }

  const UserCredit = require('../models/userCredit.model');
  const AiRequestLog = require('../models/aiRequestLog.model');

  // 1. Delete all Kundli records
  const kundliDelete = await KundliResult.deleteMany({
    $or: [{ _id: { $in: kundliIds } }, { userId: { $in: userIds } }],
  });

  // 2. Delete all UserCredit records
  const creditDelete = await UserCredit.deleteMany({
    userId: { $in: [...userIds, ...kundliIds] },
  });

  // 3. Delete all AiRequestLogs
  const aiLogDelete = await AiRequestLog.deleteMany({
    kundliId: { $in: kundliIds },
  });

  return {
    deleted: true,
    deletedKundlis: kundliDelete.deletedCount,
    deletedCredits: creditDelete.deletedCount,
    deletedAiLogs: aiLogDelete.deletedCount,
  };
}

module.exports = {
  generateKundli,
  generateTransit,
  updateKundli,
  getLatestKundliForUser,
  getKundliById,
  computeKundliResult,
  deleteAccountAndKundliData,
};
