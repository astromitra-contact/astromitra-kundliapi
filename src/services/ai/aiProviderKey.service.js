'use strict';

const AiProviderKey = require('../../models/aiProviderKey.model');
const cryptoUtil = require('../../utils/crypto');
const AppError = require('../../utils/AppError');
const env = require('../../config/env');
const { isMongoReady } = require('../../utils/mongoStatus');

function requireEncryption() {
  if (!env.ENCRYPTION_ENABLED) {
    throw new AppError(
      'AI key management requires ENCRYPTION_KEY to be configured on the server.',
      503,
      'ENCRYPTION_NOT_CONFIGURED'
    );
  }
}

function requireMongo() {
  if (!isMongoReady()) {
    throw new AppError('AI key management requires MongoDB to be configured (MONGODB_URI).', 503, 'STORAGE_REQUIRED');
  }
}

/** Strip encryptedKey before returning a key doc anywhere near an API response. */
function toSafeJson(doc) {
  return {
    id: String(doc._id),
    provider: doc.provider,
    model: doc.model,
    label: doc.label,
    maskedKey: doc.keyPreview,
    priority: doc.priority,
    active: doc.active,
    cooldownUntil: doc.cooldownUntil,
    consecutiveFailures: doc.consecutiveFailures,
    lastUsedAt: doc.lastUsedAt,
    lastSuccessAt: doc.lastSuccessAt,
    lastFailureAt: doc.lastFailureAt,
    lastFailureReason: doc.lastFailureReason,
    totalSuccessCount: doc.totalSuccessCount,
    totalFailureCount: doc.totalFailureCount,
    invalidatedAt: doc.invalidatedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function listKeys({ provider } = {}) {
  requireMongo();
  const filter = provider ? { provider } : {};
  const docs = await AiProviderKey.find(filter).sort({ provider: 1, priority: 1 }).lean();
  return docs.map(toSafeJson);
}

async function createKey({ provider, model, rawKey, label, priority, active }) {
  requireMongo();
  requireEncryption();

  const doc = await AiProviderKey.create({
    provider,
    model,
    label: label || '',
    encryptedKey: cryptoUtil.encrypt(rawKey),
    keyPreview: cryptoUtil.maskKey(rawKey),
    priority: typeof priority === 'number' ? priority : 100,
    active: active !== false,
  });

  return toSafeJson(doc);
}

async function updateKey(id, updates) {
  requireMongo();

  const allowed = {};
  if (updates.model !== undefined) allowed.model = updates.model;
  if (updates.label !== undefined) allowed.label = updates.label;
  if (updates.priority !== undefined) allowed.priority = updates.priority;
  if (updates.active !== undefined) allowed.active = updates.active;

  // Rotating in a brand-new raw key value re-encrypts it; everything else
  // (priority, active, label, model) can change without touching the key.
  if (updates.rawKey) {
    requireEncryption();
    allowed.encryptedKey = cryptoUtil.encrypt(updates.rawKey);
    allowed.keyPreview = cryptoUtil.maskKey(updates.rawKey);
    // A manually-rotated key deserves a clean slate.
    allowed.invalidatedAt = null;
    allowed.cooldownUntil = null;
    allowed.consecutiveFailures = 0;
  }

  const doc = await AiProviderKey.findByIdAndUpdate(id, { $set: allowed }, { new: true });
  if (!doc) {
    throw new AppError('No AI provider key found with this id.', 404, 'AI_KEY_NOT_FOUND');
  }
  return toSafeJson(doc);
}

async function deleteKey(id) {
  requireMongo();
  const doc = await AiProviderKey.findByIdAndDelete(id);
  if (!doc) {
    throw new AppError('No AI provider key found with this id.', 404, 'AI_KEY_NOT_FOUND');
  }
  return { deleted: true };
}

/**
 * Internal use only (keyRotation.service.js) — returns candidate keys for
 * a provider with the RAW decrypted key included, ordered by priority,
 * excluding inactive/currently-cooling-down keys. Never expose this
 * function's output to any HTTP response.
 */
async function getUsableKeysForProvider(provider) {
  if (!isMongoReady() || !env.ENCRYPTION_ENABLED) return [];

  const now = new Date();
  const docs = await AiProviderKey.find({
    provider,
    active: true,
    $or: [{ cooldownUntil: null }, { cooldownUntil: { $lte: now } }],
  })
    .sort({ priority: 1 })
    .lean();

  return docs.map((doc) => ({
    id: String(doc._id),
    provider: doc.provider,
    model: doc.model,
    priority: doc.priority,
    rawKey: cryptoUtil.decrypt(doc.encryptedKey),
  }));
}

/**
 * Global priority candidate keys across all providers with decrypted raw key.
 * Ordered by priority ascending (1 = tried first), then createdAt ascending.
 * Filters out inactive or currently cooling-down keys.
 */
async function getAllUsableKeys() {
  if (!isMongoReady() || !env.ENCRYPTION_ENABLED) return [];

  const now = new Date();
  const docs = await AiProviderKey.find({
    active: true,
    $or: [{ cooldownUntil: null }, { cooldownUntil: { $lte: now } }],
  })
    .sort({ priority: 1, createdAt: 1 })
    .lean();

  return docs.map((doc) => ({
    id: String(doc._id),
    provider: doc.provider,
    model: doc.model,
    priority: doc.priority,
    rawKey: cryptoUtil.decrypt(doc.encryptedKey),
  }));
}


/** Record a successful use — clears any cooldown/failure streak. */
async function recordSuccess(id) {
  await AiProviderKey.findByIdAndUpdate(id, {
    $set: { lastUsedAt: new Date(), lastSuccessAt: new Date(), consecutiveFailures: 0, cooldownUntil: null },
    $inc: { totalSuccessCount: 1 },
  });
}

/**
 * Record a failure. Transient classifications (RATE_LIMITED, UNAVAILABLE,
 * TIMEOUT, EMPTY_RESPONSE) get an escalating cooldown. Non-transient
 * classifications (INVALID_KEY, MODEL_NOT_FOUND) deactivate the key
 * immediately — retrying a bad key/model wastes a request every time.
 */
async function recordFailure(id, classification, reasonText) {
  const isPermanent = classification === 'INVALID_KEY' || classification === 'MODEL_NOT_FOUND';

  const doc = await AiProviderKey.findById(id);
  if (!doc) return;

  const consecutiveFailures = (doc.consecutiveFailures || 0) + 1;
  // Fast cooldown for rate limits & transient traffic spikes: 15s, 30s, capped at 60s.
  // Provider rate-limit windows (RPM) reset every 60 seconds.
  const cooldownSeconds = isPermanent ? 0 : Math.min(60, [15, 30, 60][Math.min(consecutiveFailures - 1, 2)] || 60);

  await AiProviderKey.findByIdAndUpdate(id, {
    $set: {
      lastUsedAt: new Date(),
      lastFailureAt: new Date(),
      lastFailureReason: `${classification}: ${reasonText || ''}`.slice(0, 500),
      consecutiveFailures,
      cooldownUntil: isPermanent ? null : new Date(Date.now() + cooldownSeconds * 1000),
      ...(isPermanent ? { active: false, invalidatedAt: new Date() } : {}),
    },
    $inc: { totalFailureCount: 1 },
  });
}

/**
 * One-time migration convenience: if GEMINI_API_KEY/GROQ_API_KEY are still
 * set in .env (old design) and MongoDB has zero keys for that provider
 * yet, seed one encrypted DB record from it so existing chat functionality
 * keeps working immediately after this upgrade with zero manual admin
 * steps. Called once at server startup (see server.js). Safe to call
 * repeatedly — only inserts when the provider truly has zero keys.
 */
async function seedFromEnvIfEmpty() {
  if (!isMongoReady() || !env.ENCRYPTION_ENABLED) return;

  const seeds = [
    { provider: 'gemini', rawKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL },
    { provider: 'groq', rawKey: env.GROQ_API_KEY, model: env.GROQ_MODEL },
  ];

  for (const seed of seeds) {
    if (!seed.rawKey) continue;
    // eslint-disable-next-line no-await-in-loop
    const existingCount = await AiProviderKey.countDocuments({ provider: seed.provider });
    if (existingCount > 0) continue;

    // eslint-disable-next-line no-await-in-loop
    await createKey({
      provider: seed.provider,
      model: seed.model,
      rawKey: seed.rawKey,
      label: 'Auto-migrated from .env',
      priority: 1,
      active: true,
    });

    // eslint-disable-next-line no-console
    console.warn(
      `[aiProviderKey.service] Migrated ${seed.provider.toUpperCase()}_API_KEY from .env into an encrypted ` +
      `MongoDB record. You can now remove ${seed.provider.toUpperCase()}_API_KEY from .env — manage this ` +
      'key (and add more) via the admin API from now on.'
    );
  }
}

module.exports = {
  listKeys,
  createKey,
  updateKey,
  deleteKey,
  getUsableKeysForProvider,
  getAllUsableKeys,
  recordSuccess,
  recordFailure,
  seedFromEnvIfEmpty,
};
