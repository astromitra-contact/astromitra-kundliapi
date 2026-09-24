'use strict';

const mongoose = require('mongoose');

/**
 * A single generated Kundli record, identified by its own stable Mongo _id
 * (returned to clients as `kundliId`).
 *
 * IMPORTANT: this is intentionally NOT deduplicated by content. An earlier
 * version keyed documents by a hash of (dateOfBirth, timeOfBirth,
 * birthPlace) with a unique index, to reuse identical calculations. That
 * broke the update flow: PATCH-ing one record's birth details to match
 * another existing record's content caused a duplicate-key error, since two
 * different _ids could no longer both hold that same content-hash.
 *
 * Each `/generate` call now always creates its own new document, and
 * `PATCH /:kundliId` always updates that same document in place (its _id
 * never changes). There is no cross-record content dedup any more — the
 * simplicity/correctness of "one id = one editable record" matters more
 * here than reusing identical calculations, and Swiss Ephemeris
 * recalculation is cheap (milliseconds).
 *
 * No user accounts/auth: any document is readable/updatable by anyone who
 * has its id, same as a share-link.
 */
const kundliResultSchema = new mongoose.Schema(
  {
    // Optional. Not an auth/ownership concept (this service has no user
    // accounts) — just an opaque client-supplied identifier, set only when
    // the caller includes `userId` in POST /api/kundli/generate. Existing
    // callers that omit it are completely unaffected; this field simply
    // stays unset. Used by the Chat API (chat.service.js) to look up "the
    // user's" most recently generated Kundli.
    userId: { type: String, index: true },
    requestInput: {
      name: String,
      dateOfBirth: String,
      timeOfBirth: String,
      birthPlace: String,
    },
    result: { type: mongoose.Schema.Types.Mixed, required: true },

    // Admin-managed. Defaults true so every existing record and every
    // record created before this field existed behaves exactly as before.
    // When false, /api/chat/ask refuses to serve this kundliId (see
    // chat.service.js) — a lightweight moderation/suspension switch, not a
    // delete.
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('KundliResult', kundliResultSchema);
