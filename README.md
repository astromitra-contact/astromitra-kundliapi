# AstroMitra Backend API

A backend service providing:
1. **Kundli calculation** — Vedic (sidereal) birth chart: Ascendant, planetary positions, Rashi, Nakshatra, Pada, and 12 Whole-Sign houses, from name/date/time/place of birth.
2. **Current transit (Gochar)** — same-engine sidereal positions for right now (or any moment).
3. **Chat API** — an AI-backed Vedic-astrology Q&A endpoint grounded in a user's birth chart + current transit, with a backend-enforced daily credit/question allowance, automatically routed across multiple Gemini/Groq API keys with failover.
4. **Admin panel (API only)** — dashboard stats, Kundli record management, AI provider key management (encrypted, with automatic fallback/rotation), and editable AI prompt settings — all behind JWT-protected `/api/admin/*` routes.

> **Scope note:** the original version of this project was scoped as
> *Kundli calculation only* — no chat/AI, no credits, no admin panel, no
> user/auth concept. The Chat API and then the Admin API (§ below) were
> added afterwards on explicit request, deliberately reintroducing those
> pieces one at a time. Still **not** part of this repo, per the original
> spec: the Flutter app itself, any ads SDK integration, payments, or any
> UI. The public Kundli/Transit/Chat APIs still have no authenticated-user
> concept — `kundliId` is still the sole reference for a chart/credit
> ledger, same as before. Only the *admin* surface (`/api/admin/*`) has
> real authentication, because it's the one part of this system that
> genuinely needs it (encrypted API key management, moderation actions).

```
Client
  → POST /api/kundli/generate
  → validate input
  → GeoNames: birth place → lat/lon/timezone
  → convert local birth time → UTC (DST-aware)
  → Swiss Ephemeris: sidereal chart calculation
  → structured JSON response (includes kundliId)

Client
  → POST /api/chat/ask { kundliId, question }
  → backend: atomically check + deduct credits, keyed by kundliId (never trusts the client)
  → backend: look up that Kundli + current transit (MongoDB + existing services)
  → backend: build a structured Vedic-astrology prompt (admin-editable wording)
  → backend: AI Provider Manager — try Gemini keys by priority, then Groq keys by priority,
             entirely transparent to the client (never know which key/provider answered)
  → structured JSON answer

Admin (Postman/internal tool only — no UI)
  → POST /api/admin/auth/login { email, password } → JWT
  → all other /api/admin/* routes require that JWT
  → manage AI provider keys (stored AES-256-GCM encrypted in MongoDB, never in .env)
  → manage Kundli records, view stats, edit the AI prompt
```

---

## ⚠️ License & Compliance Obligations — read before deploying

The calculation engine (`@swisseph/node`, wrapping Astrodienst's Swiss
Ephemeris C library) is **AGPL-3.0 licensed**. Swiss Ephemeris has always
been dual-licensed by Astrodienst: **AGPL, or a paid commercial license** —
there is no free-and-proprietary option.

Because this project uses the AGPL option, **this entire repository is
licensed AGPL-3.0-or-later** (see `LICENSE`). In practice this means:

- **Network use counts as distribution.** If someone interacts with this API
  over a network (i.e. calls the endpoint), AGPL §13 requires that you offer
  them the complete corresponding source code of the service they're
  talking to — not just of `@swisseph/node`, but of this whole codebase
  (and anything you link into the same running program).
- If you modify this code, your modifications must also be released under
  AGPL-3.0 (or a compatible license) when you run the modified version as a
  network service.
- You must **preserve copyright and license notices** — see
  `THIRD_PARTY_NOTICES.md` for the required Astrodienst notice.
- You may **not** use "Swiss Ephemeris" or Astrodienst's name to promote a
  derived product without their written permission.
- If your product needs to stay closed-source, AGPL is **not** an option for
  you — you would instead need to purchase a **Swiss Ephemeris Professional
  License** directly from Astrodienst (<https://www.astro.com/swisseph/>)
  and use the underlying C library under that commercial license instead of
  this AGPL npm wrapper.

This is general information, not legal advice. If you're unsure how AGPL
applies to your specific deployment/architecture, consult a lawyer.

---

## Tech Stack

- **Node.js** + **Express.js** — HTTP API
- **@swisseph/node** — Swiss Ephemeris native bindings (AGPL-3.0) — the only
  calculation engine used; no astrology values are invented, guessed, or
  hard-coded
- **GeoNames API** — birth place → coordinates + timezone
- **Luxon** — IANA-timezone-database-driven local→UTC conversion (correct
  historical DST handling)
- **MongoDB** (optional for Kundli/Transit, **required** for Chat) — stores each generated Kundli as its own updatable record, and per-user daily credit/question ledgers
- **Gemini API** (Chat only) — Google's LLM, called server-side only; interprets the Swiss-Ephemeris-calculated chart data, never generates or alters any astrological figure itself

No AI/LLM is used anywhere in the Kundli/Transit calculation path — those
are 100% Swiss Ephemeris. Gemini is used **only** in the Chat API, purely
for natural-language interpretation of numbers this backend already
calculated.

## Calculation Settings

| Setting | Value |
|---|---|
| Zodiac | Sidereal |
| Ayanamsa | Lahiri (Chitrapaksha) |
| House system | Whole Sign (Rashi houses) |
| Lunar nodes | Mean Node (Rahu/Ketu); Ketu = Rahu + 180° |
| Ephemeris | Swiss Ephemeris (bundled `.se1` files) |

These are fixed defaults chosen because they are the most common conventions
in mainstream Vedic/Jyotish Kundli software. They are all reported back in
`calculationSettings` in every response so consumers know exactly what was
used.

## Project Structure

```
src/
  routes/
    kundli.routes.js, chat.routes.js
    admin/admin.routes.js
  controllers/
    kundli.controller.js, chat.controller.js
    admin/adminAuth.controller.js, adminStats.controller.js,
    admin/adminKundli.controller.js, adminAiKey.controller.js, adminAiSettings.controller.js
  services/
    location.service.js     GeoNames place → lat/lon/timezone
    timezone.service.js     local time → UTC (DST-aware, via Luxon)
    astrology.service.js    Swiss Ephemeris sidereal chart calculation
    kundli.service.js       orchestrates the above + optional Mongo persistence
    credit.service.js       daily credit/question allowance — all validation
                             and deduction happens here, atomically, in Mongo
    aiSettings.service.js   admin-editable system prompt / instructions (Mongo,
                             with hardcoded fallback defaults if unconfigured)
    chat.service.js         orchestrates credits + Kundli lookup + transit +
                             prompt building + the AI provider manager below
    ai/
      gemini.service.js       Gemini API client — takes an explicit key/model,
                               never reads a key from env
      groq.service.js         Groq API client — same explicit-key contract
      providerError.js        shared error classification (RATE_LIMITED,
                               INVALID_KEY, MODEL_NOT_FOUND, ...) used by
                               keyRotation.service.js to decide cooldown vs.
                               deactivation
      aiProviderKey.service.js  encrypted CRUD over stored keys (AES-256-GCM),
                               plus a one-time .env → MongoDB migration seed
      keyRotation.service.js  THE fallback engine: tries every active Gemini
                               key by priority, then every active Groq key,
                               until one succeeds
      aiProvider.service.js   public entry point (askAI()) — chat.service.js
                               calls only this; never touches providers/keys
                               directly. Also writes the usage log.
    admin/
      adminAuth.service.js    single-admin JWT login (bcrypt + jsonwebtoken)
      adminStats.service.js   dashboard counts + basic daily usage
      adminKundli.service.js  list/search/view/activate/deactivate/delete
  models/
    kundli.model.js         Mongoose schema for a stored Kundli record (+ `active` flag)
    userCredit.model.js     Mongoose schema for per-kundliId daily credit ledger
    aiProviderKey.model.js  encrypted AI provider keys + rotation/health bookkeeping
    aiSettings.model.js     singleton AI prompt settings document
    aiRequestLog.model.js   lightweight per-request log (admin stats + key health)
  middleware/
    adminAuth.middleware.js  JWT verification for all /api/admin/* routes
  utils/
    AppError.js, errorHandler.js, validators.js, adminValidators.js,
    astroReference.js, mongoStatus.js, crypto.js (AES-256-GCM for AI keys)
  config/
    env.js, db.js
  app.js
  server.js
scripts/
  hash-admin-password.js   CLI: generate a bcrypt hash for ADMIN_PASSWORD_HASH
```

---

## Installation

```bash
git clone <this-repo>
cd astromitra-kundli-api
npm install
cp .env.example .env
# edit .env — see "Environment Variables" below for what's required per feature
npm start
```

Requires Node.js ≥ 18. `@swisseph/node` ships prebuilt native binaries for
common platforms; if none match yours, `npm install` will attempt to
compile from source (needs a C++ toolchain — see that package's own README
if you hit build errors).

### GeoNames setup (required)

1. Create a free account: <https://www.geonames.org/login>
2. Enable "Free Web Services" for the account:
   <https://www.geonames.org/manageaccount>
3. Put the username in `.env` as `GEONAMES_USERNAME`.

The free tier has a daily/hourly request quota — for production traffic
consider GeoNames' paid tier.

## Environment Variables

See `.env.example` for full comments. Summary by feature:

```
# Kundli/Transit (core)
GEONAMES_USERNAME=      # required
MONGODB_URI=             # optional for Kundli/Transit, required for Chat + Admin

# AI keys — see .env.example: these are a ONE-TIME MIGRATION BOOTSTRAP only.
# Going forward, keys live encrypted in MongoDB, managed via /api/admin/ai-keys.
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.6-flash
GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile
GEMINI_BASE_URL=https://generativelanguage.googleapis.com
GROQ_BASE_URL=https://api.groq.com/openai/v1

# Encryption — required for /api/admin/ai-keys and for the chat pipeline to
# decrypt stored keys. Generate with: openssl rand -hex 32
ENCRYPTION_KEY=

# Admin panel auth — required for all of /api/admin/* except login itself.
ADMIN_EMAIL=
ADMIN_PASSWORD_HASH=      # bcrypt hash — generate with: npm run hash-admin-password -- "your-password"
JWT_SECRET=               # generate with: openssl rand -hex 32
ADMIN_JWT_EXPIRES_IN=12h

# General
PORT=3000
NODE_ENV=development
CORS_ORIGIN=*
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=60
GEONAMES_BASE_URL=http://api.geonames.org
```

API credentials are **only** read server-side from environment variables
(or, for AI provider keys, from encrypted MongoDB records — see the Admin
API section) and are **never** included in any API response or sent to the
Flutter client. This applies to `GEONAMES_USERNAME`, `MONGODB_URI`,
`ENCRYPTION_KEY`, `JWT_SECRET`, `ADMIN_PASSWORD_HASH`, and every Gemini/Groq
key — the admin API only ever returns a masked preview (e.g.
`AIza****7890`) of a stored key, never the raw value.

---

## Kundli / Transit API

Three endpoints: generate a birth chart, get current/any-moment planetary
transit, and update a previously generated chart's inputs. (The Chat API is
documented separately, further below.)

### `POST /api/kundli/generate`

**Request body:**

```json
{
  "name": "Test User",
  "dateOfBirth": "1990-05-15",
  "timeOfBirth": "14:30",
  "birthPlace": "Mumbai, India"
}
```

The response includes a `kundliId` (when `MONGODB_URI` is configured) —
save it on the client. It's what `PATCH /api/kundli/:kundliId` uses to
update this chart later, and what the entire Chat API (`/api/chat/*`)
uses as its sole reference to this chart (see the Chat API section).

*(There is also an optional `userId` field accepted here, tagging the
stored record — a leftover from an earlier design where the Chat API
looked charts up by "most recently generated for this userId". The Chat
API no longer uses it; `kundliId` replaced it as the more precise
reference. Harmless to send or omit; safe to remove from your client if
you were only sending it for that purpose.)*

| Field | Type | Notes |
|---|---|---|
| `name` | string | 1–120 chars, letters/spaces/`.'-` only |
| `dateOfBirth` | string | `YYYY-MM-DD`, must be a real date, not in the future, year ≥ 1800 |
| `timeOfBirth` | string | `HH:mm`, 24-hour local clock time at the birth place |
| `birthPlace` | string | free text, e.g. `"City, Country"` or `"City, State, Country"` |

**Success response — `200 OK`:**

```json
{
  "success": true,
  "data": {
    "birthDetails": {
      "name": "Test User",
      "dateOfBirth": "1990-05-15",
      "timeOfBirth": "14:30",
      "birthPlace": "Mumbai, India"
    },
    "location": {
      "city": "Mumbai",
      "state": "Maharashtra",
      "country": "India",
      "latitude": 19.07283,
      "longitude": 72.88261,
      "timezone": "Asia/Kolkata"
    },
    "timeConversion": {
      "localIso": "1990-05-15T14:30:00.000+05:30",
      "utcIso": "1990-05-15T09:00:00.000Z",
      "utcOffsetMinutes": 330,
      "isDST": false,
      "julianDayUT": 2448027.875
    },
    "calculationSettings": {
      "zodiac": "sidereal",
      "ayanamsa": "Lahiri (Chitrapaksha)",
      "ayanamsaValue": 23.6512,
      "houseSystem": "Whole Sign (Rashi)",
      "houseSystemCode": "W",
      "nodeType": "mean",
      "ephemeris": "Swiss Ephemeris (bundled .se1 files)",
      "mc": { "siderealLongitude": 101.23, "tropicalLongitude": 124.88 }
    },
    "lagna": {
      "longitude": 214.55,
      "tropicalLongitude": 238.2,
      "rashi": "Tula",
      "rashiEnglish": "Libra",
      "rashiLord": "Venus",
      "degreeInRashi": 4.55,
      "nakshatra": "Swati",
      "nakshatraLord": "Rahu",
      "pada": 2,
      "houseNumber": 1
    },
    "houses": [
      { "houseNumber": 1, "rashiIndex": 6, "rashi": "Tula", "rashiEnglish": "Libra", "rashiLord": "Venus", "cuspLongitude": 180 }
    ],
    "planets": [
      {
        "key": "sun",
        "name": "Sun",
        "longitude": 30.77,
        "latitude": 0.0001,
        "distanceAU": 1.0107,
        "speedLongitude": 0.9556,
        "isRetrograde": false,
        "rashi": "Vrishabha",
        "rashiEnglish": "Taurus",
        "rashiLord": "Venus",
        "degreeInRashi": 0.77,
        "nakshatra": "Krittika",
        "nakshatraLord": "Sun",
        "pada": 1,
        "houseNumber": 8
      }
    ],
    "nakshatras": {
      "moon": { "nakshatra": "...", "lord": "...", "pada": 1, "rashi": "..." },
      "ascendant": { "nakshatra": "Swati", "lord": "Rahu", "pada": 2, "rashi": "Tula" }
    },
    "generatedAt": "2026-08-13T10:00:00.000Z",
    "kundliId": "66c1f2a1e4b0a1234567890a",
    "stored": true
  }
}
```

`kundliId` + `stored: true` are present whenever `MONGODB_URI` is
configured and the save succeeded (used for the `PATCH` update endpoint
below); `kundliId` is `null` and `stored: false` if MongoDB isn't set up.
Every `/generate` call creates its **own new** record — even if the birth
details exactly match an earlier request, you get a new, independent
`kundliId` (no cross-request content deduplication; see the note on the
update endpoint for why). `timeAccuracy` (shown just after `birthDetails`
in the actual response) is `{ "isExact": true, ... }` when `timeOfBirth`
was supplied, or flags the noon-default fallback when it wasn't — see the
`timeOfBirth` note below.

`houses` contains all 12 entries; `planets` contains Sun, Moon, Mars,
Mercury, Jupiter, Venus, Saturn, Rahu, and Ketu (9 entries) — truncated
above for brevity.

**Error response shape** (validation, GeoNames failure, ambiguous place,
etc.):

```json
{
  "success": false,
  "error": {
    "code": "PLACE_NOT_FOUND",
    "message": "Could not find a location matching \"Nowhereville\". Please provide a more specific birth place, e.g. \"City, State, Country\".",
    "details": [ ]
  }
}
```

Relevant error codes: `VALIDATION_ERROR` (400), `PLACE_NOT_FOUND` (422),
`INVALID_LOCAL_TIME` (422), `INVALID_DATETIME` (400), `INVALID_COORDINATES`
(400), `GEONAMES_UNAVAILABLE` / `GEONAMES_ERROR` (502),
`GEONAMES_CONFIG_ERROR` (500), `STORAGE_REQUIRED` (503, `PATCH` without
Mongo configured), `INVALID_ID` / `KUNDLI_NOT_FOUND` (400 / 404, `PATCH`
with a bad or unknown `kundliId`), `RATE_LIMITED` (429), `INTERNAL_ERROR`
(500). Stack traces are never included in production (`NODE_ENV=production`).

### Example `curl`

```bash
curl -X POST http://localhost:3000/api/kundli/generate \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "dateOfBirth": "1990-05-15",
    "timeOfBirth": "14:30",
    "birthPlace": "Mumbai, India"
  }'
```

`timeOfBirth` is **optional**. If omitted, the calculation falls back to
12:00 (noon) local time and the response includes a `timeAccuracy` block
flagging the Ascendant/Houses as approximate (see full response shape
above/below) — Sun and other slower-moving planets' Rashi remain reliable
regardless.

### `POST /api/kundli/transit`

Current (or any given moment's) planetary transit / **Gochar** positions —
useful for "when will X happen" / muhurat-style questions that need *both*
a birth chart (from `/generate`) and the current sky.

**Request body (all fields optional):**

```json
{
  "dateTime": "2026-08-14T05:30:00Z",
  "latitude": 23.0225,
  "longitude": 72.5714
}
```

| Field | Notes |
|---|---|
| `dateTime` | ISO 8601. Omit for "right now" (server clock, UTC). |
| `latitude` / `longitude` | Omit for planet positions only (no Lagna/Houses). |
| `place` | Alternative to lat/lon — free text, resolved via GeoNames (same as birth place). Ignored if lat/lon are given. |

**Response** — same `calculationSettings`/`planets` shape as `/generate`. If
no location was resolvable, `lagna` and `houses` are `null` and only
`planets` (Rashi/Nakshatra/retrograde per graha) is populated. Not cached —
a transit is time-sensitive by definition.

```bash
curl -X POST http://localhost:3000/api/kundli/transit \
  -H "Content-Type: application/json" -d '{}'
```

### `PATCH /api/kundli/:kundliId`

Update a previously generated Kundli's birth details (any subset of
`name`, `dateOfBirth`, `timeOfBirth`, `birthPlace`) and get back the fully
recalculated chart. Every `/generate` response includes a `kundliId` you
use here. **Requires `MONGODB_URI` to be configured** — without it this
returns `503 STORAGE_REQUIRED`, since there is nothing to look up.

```bash
curl -X PATCH http://localhost:3000/api/kundli/66c1f2a1e4b0a1234567890a \
  -H "Content-Type: application/json" -d '{"timeOfBirth":"15:10"}'
```

Only the sent fields change; the rest are kept from the last saved values.
The `kundliId` stays the same across updates. There is **no
authentication/ownership check** on `kundliId` (this service has no user
accounts by design) — treat it like a share-link id: anyone who has it can
update that record, so keep it private on the client side.

### `GET /health`

Simple liveness check, returns `{ "success": true, "status": "ok" }`.

---

## Chat API

> Added on top of the original Kundli-only scope — see the scope note at
> the top of this README. Requires `MONGODB_URI` (birth chart lookup +
> credit tracking) and **at least one active AI provider key** (Gemini
> and/or Groq, managed via `/api/admin/ai-keys` — see the Admin API
> section). Without either, `/api/chat/*` returns a clear `503` instead of
> the server failing to start — the Kundli/Transit endpoints are
> unaffected either way.

A Kundli must exist first (`POST /api/kundli/generate`) before asking a
question about it — the `kundliId` from that response is what you use
here. A deactivated Kundli (see Admin API → Kundli management) cannot be
used for chat — `403 KUNDLI_INACTIVE`.

**`kundliId` is the sole reference for the entire Chat API** — no separate
`userId` concept. It's already unique per record in MongoDB, so it
identifies both "which chart" (precisely — no "most recent" guessing) and
"whose daily credit ledger" in one id. Credits are tracked **per
`kundliId`**, i.e. per chart on file, not per person — if the same person
has multiple charts (e.g. their own + a family member's), each one gets
its own independent 50-credit/4-question daily allowance.

### `POST /api/chat/ask`

**Request:**
```json
{
  "kundliId": "66c1f2a1e4b0a1234567890a",
  "question": "When will I get married and how will my business go?"
}
```

**Flow:** validate input → **atomically check + deduct credits on the
backend**, keyed by `kundliId` (before anything else happens) → look up
that exact Kundli in MongoDB (must be `active`) → get current transit via
the existing Transit service, calculated relative to that chart's birth
location → build a structured prompt (birth chart JSON + transit JSON +
the question + admin-editable Vedic interpretation instructions) → **AI
Provider Manager**: try every active Gemini key by priority, then every
active Groq key by priority, until one succeeds — entirely transparent to
this endpoint and to the client; neither ever learns which key/provider
actually answered → return the answer. Credits are deducted **before** any
AI call, so a rejected request never costs anything.

**Success (`200`) — matches the requested shape exactly, no `data` wrapper:**
```json
{ "success": true, "answer": "...", "remainingCredits": 34, "remainingQuestions": 3 }
```

**Limit reached (`429`) — also matches the requested shape exactly:**
```json
{ "success": false, "code": "QUESTION_LIMIT_REACHED", "message": "Daily question limit reached." }
```
(Every other error from this endpoint — validation, missing/inactive
Kundli, AI failure, storage not configured — uses this API's normal
failure, storage not configured — uses this API's normal
`{ "error": { "code", "message" } }` shape; only this specific business
case matches the literal spec you gave.)

Other error codes here: `VALIDATION_ERROR` (400, e.g. missing/malformed
`kundliId`), `STORAGE_REQUIRED` (503, Mongo not configured),
`KUNDLI_NOT_FOUND` (404 — the given `kundliId` doesn't exist),
`KUNDLI_INACTIVE` (403 — deactivated by an admin), `ALL_AI_PROVIDERS_FAILED`
(503 — every configured Gemini and Groq key failed; check
`/api/admin/ai-keys` for key health/cooldown status and the server log for
per-key failure reasons).

### `POST /api/chat/reward`

Grants the one-per-day rewarded-ad bonus (**exactly 20 credits, up to 2
extra questions**) for this `kundliId`. The ad itself plays client-side
(out of scope here, per spec) — call this **after** the ad finishes, so
the credit grant is never client-trusted. Only succeeds once the normal
4-question allowance is used up, and only once per UTC day.

```json
{ "kundliId": "66c1f2a1e4b0a1234567890a" }
```

```bash
curl -X POST http://localhost:3000/api/chat/reward \
  -H "Content-Type: application/json" -d '{"kundliId":"66c1f2a1e4b0a1234567890a"}'
```

Errors: `NORMAL_ALLOWANCE_NOT_EXHAUSTED` (400, tried to claim before using
the 4 normal questions), `REWARD_ALREADY_CLAIMED` (409, one per day).

### `GET /api/chat/credits/:kundliId`

Convenience read-only status check (not in the original spec, added so the
Flutter client can display remaining credits/questions without spending
one to find out).

```bash
curl http://localhost:3000/api/chat/credits/66c1f2a1e4b0a1234567890a
```
```json
{
  "success": true,
  "normalDailyCredits": 12,
  "normalQuestionsUsed": 3,
  "rewardCredits": 0,
  "rewardQuestionsUsed": 0,
  "rewardClaimedToday": false,
  "creditResetDate": "2026-08-17",
  "remainingCredits": 12,
  "remainingQuestions": 1,
  "rewardEligible": false
}
```

### Credit system rules (all enforced backend-only, in MongoDB)

| Field | Meaning |
|---|---|
| `normalDailyCredits` | Starts at 50/day, decremented by a random cost per question |
| `normalQuestionsUsed` | Hard-capped at **4** — this counter, not the credit balance, is what actually blocks a 5th question, exactly as specified |
| `rewardCredits` | 20, only after `POST /api/chat/reward` succeeds |
| `rewardQuestionsUsed` | Hard-capped at **2** |
| `rewardClaimedToday` | Resets to `false` every day; blocks claiming twice |
| `creditResetDate` | UTC `YYYY-MM-DD`; every field above resets automatically the first time this `kundliId` is seen on a new UTC day |

Per-question cost is randomized within a bounded range (not a fixed price,
per spec) but **the question counters are the real gate** — credits can
hit zero early or have leftovers, it never changes whether a 5th normal or
3rd reward question is allowed. All checks use atomic MongoDB
`findOneAndUpdate` with a conditional filter (e.g.
`normalQuestionsUsed: { $lt: 4 }`), so two near-simultaneous requests for
the same `kundliId` can't race past the cap — this was tested directly.

`kundliId` has no authentication behind it (same as the rest of this
service) — anyone who has a given `kundliId` can spend its credits and
read its chat answers, same as it already behaves for `PATCH
/api/kundli/:kundliId`. If that's a problem for your deployment, you need
a real auth layer in front of this API; it's explicitly out of scope here
per the original spec.

*(Internally, `credit.service.js` and the `UserCredit` Mongoose model
still use a field/parameter named `userId` — it now simply holds the
`kundliId` string. Left as-is rather than renamed throughout, since it's
purely a label and doesn't affect behavior; safe to rename later if it
bothers you.)*

---

## Admin API

> Added on top of the Kundli + Chat scope — see the scope note at the top
> of this README. Requires `MONGODB_URI`, `ENCRYPTION_KEY`, `ADMIN_EMAIL`,
> `ADMIN_PASSWORD_HASH`, and `JWT_SECRET` (see Environment Variables
> above). No UI is included — use Postman/curl/an internal tool.
>
> **This is API-only, single-admin-account auth** — enough to satisfy "AI
> keys must never be in .env / must be encrypted / admin routes must be
> protected," without building a full multi-admin user system that wasn't
> asked for.

All routes are mounted at `/api/admin/*`, are **not reachable through**
the public `/api/kundli/*` or `/api/chat/*` surface, and (except login)
require `Authorization: Bearer <token>` from a successful login.

### `POST /api/admin/auth/login`

```json
{ "email": "admin@example.com", "password": "your-password" }
```
```json
{ "success": true, "token": "eyJ...", "expiresIn": "12h" }
```
Rate-limited separately and more strictly than other routes (10 attempts /
15 min per IP) since it's the one unauthenticated admin route. Errors:
`ADMIN_NOT_CONFIGURED` (503, env vars above not set), `ADMIN_INVALID_CREDENTIALS`
(401 — same generic message for wrong email or wrong password, so a
caller can't tell which one was wrong).

Every other route below: send the returned token as
`Authorization: Bearer <token>` on every request. Missing/malformed
header → `401 ADMIN_AUTH_REQUIRED`; expired/invalid token →
`401 ADMIN_SESSION_INVALID`.

### Dashboard / stats

```
GET /api/admin/stats/dashboard
GET /api/admin/stats/daily?days=7
```
Dashboard returns total Kundli records, today's count, total/today chat
question and AI request counts, AI success rate, and how many
`kundliId`s used a question today. `daily` returns a simple day-by-day
breakdown (Kundli generated + chat questions) for the last `days` (1-90,
default 7). Deliberately minimal — this is not a general analytics
pipeline, just enough for a dashboard (see `models/aiRequestLog.model.js`
for what's actually logged and why).

### Kundli / "user" management

There is no separate User model — per spec, each `kundliId` **is** the
user reference.

```
GET    /api/admin/kundlis?search=<text>&page=1&limit=20
GET    /api/admin/kundlis/:kundliId
PATCH  /api/admin/kundlis/:kundliId/active   { "active": false }
DELETE /api/admin/kundlis/:kundliId
```
`search` matches (case-insensitive) against name or birth place, or an
exact `kundliId` if the search text is a valid id. `GET .../:kundliId`
returns the full stored Kundli JSON plus its current credit-ledger status.
Deactivating (`active: false`) makes `/api/chat/ask` refuse that
`kundliId` with `403 KUNDLI_INACTIVE` — Kundli generation/lookup elsewhere
is unaffected, this only gates chat. Delete is permanent and also removes
that `kundliId`'s credit ledger.

### AI provider key management

```
GET    /api/admin/ai-keys?provider=gemini
POST   /api/admin/ai-keys
PATCH  /api/admin/ai-keys/:id
DELETE /api/admin/ai-keys/:id
```

**Create:**
```json
{
  "provider": "gemini",
  "model": "gemini-3.6-flash",
  "rawKey": "AIzaSy...",
  "label": "Prod key #1",
  "priority": 1,
  "active": true
}
```

Every response — list, create, update — returns a **masked** key
(`AIza****7890`) and never the raw value; the raw key exists only
encrypted in MongoDB (AES-256-GCM, derived from `ENCRYPTION_KEY`) and
briefly in memory while an actual AI call is in flight. `PATCH` with a new
`rawKey` re-encrypts and rotates it (and resets that key's failure/cooldown
state to a clean slate); `PATCH` without `rawKey` only touches
`model`/`label`/`priority`/`active`. Each key also reports its own
rotation health: `cooldownUntil`, `consecutiveFailures`, `lastSuccessAt`,
`lastFailureAt`/`lastFailureReason`, `totalSuccessCount`/`totalFailureCount`,
`invalidatedAt`.

**How the fallback actually works** (`services/ai/keyRotation.service.js`):
on every `/api/chat/ask` call, the system tries all **active, not-currently-
cooling-down** Gemini keys in ascending `priority` order; the first one
that succeeds answers the request. If every Gemini key fails, it moves on
to Groq keys the same way. A transient failure (rate limit/quota/5xx/
timeout/empty response) puts that key on an escalating cooldown (1 min →
5 min → 15 min → capped at 30 min) and the *next* key is tried immediately
in the same request — the end user never sees an error as long as one
active key anywhere succeeds. A non-transient failure (401/403 invalid
key, or 404 model not found/retired) deactivates that key immediately
(`active: false`, `invalidatedAt` set) rather than waiting out a cooldown
that won't help. Only if **every** key across **both** providers fails
does the client see `503 ALL_AI_PROVIDERS_FAILED`.

### AI prompt settings

```
GET   /api/admin/ai-settings
PATCH /api/admin/ai-settings
```
```json
{ "systemPrompt": "...", "astrologyInstructions": "...", "activeProviderPreference": "gemini" }
```
Editable without a code deploy or restart — `chat.service.js` reads these
fresh on every request via `aiSettings.service.js`. `PATCH` accepts any
subset of the three fields. If MongoDB has no settings document yet,
`GET` returns (and seeds) sensible built-in defaults; `activeProviderPreference`
is currently informational (Gemini is always tried before Groq per the
"critical" fallback-order requirement) rather than a hard override.

---

## MongoDB Storage

If `MONGODB_URI` is set, every `/generate` call is saved as its own
independent document and returns a `kundliId`. There is **no
content-based deduplication** — two requests with identical birth details
still produce two separate records/ids — because each id needs to be
independently editable via `PATCH /api/kundli/:kundliId` without ever
colliding with another record (an earlier design that deduplicated by
content caused exactly that collision when an update's new details
happened to match another existing record — fixed by removing the dedup
and always creating/updating one specific document by its own `_id`).

There are **no user accounts, sessions, or ownership** on a document — a
`kundliId` behaves like a share-link id: anyone who has it can `PATCH` it,
and (per the Chat API section above) anyone who has it can also ask
questions against it and spend its credit ledger.

If `MONGODB_URI` is omitted, `/generate` and `/transit` work identically
but every result has `kundliId: null` / `stored: false`, `PATCH
/api/kundli/:kundliId` returns `503 STORAGE_REQUIRED`, and all of
`/api/chat/*` returns `503 STORAGE_REQUIRED` (there is nothing to look up
or track).

## Security

- All input validated and sanitized (`express-validator`): strict date/time
  formats, character allow-lists, length limits, JSON body size cap (20kb).
- `helmet` for standard security headers; CORS is configurable.
- Per-IP rate limiting on every route group (`/api/kundli/*`, `/api/chat/*`,
  and `/api/admin/*` each have their own limiter; admin login has an extra,
  stricter one since it's the one unauthenticated admin route).
- Centralized error handler: no stack traces or internals leak to clients
  in production; all errors logged server-side.
- `GEONAMES_USERNAME`, `MONGODB_URI`, `JWT_SECRET`, `ENCRYPTION_KEY`, and
  `ADMIN_PASSWORD_HASH` (a bcrypt hash, never the plaintext password) are
  read only from environment variables server-side and **never** appear in
  any response or reach the Flutter client.
- **AI provider keys (Gemini/Groq) are never in `.env` at all** (beyond a
  one-time migration bootstrap, see Environment Variables) — they're
  stored AES-256-GCM encrypted in MongoDB, decrypted only in memory just
  before an outbound AI call, and every admin API response returns a
  masked preview, never the raw value.
- All Chat API credit checks/deductions happen atomically in MongoDB via
  `credit.service.js` — never in the client, never trusting a client-sent
  credit/question count.
- Admin routes require a valid JWT (bcrypt-verified login, single admin
  account) and are on a completely separate router/base path from the
  public Kundli/Chat APIs — they cannot be reached by guessing a public
  endpoint.
- No real authentication/user-account system exists on the **public**
  surface, by design (per the original spec). `kundliId` (chart lookup +
  Chat credits, both) has no verification behind it — anyone who has a
  given `kundliId` can read that chart and spend its chat credits. Do not
  expose this service directly to the public internet without adding your
  own access control/gateway if that matters for your use case. (This does
  not apply to `/api/admin/*`, which does have real auth.)

## Dependencies & Licenses

New dependencies added for the Admin/AI-key-management update: `bcryptjs`
(admin password hashing, BSD-3-Clause) and `jsonwebtoken` (admin session
tokens, MIT) — both verified against the npm registry before adding, no
native compilation required. `axios` (already a dependency) is reused for
both Gemini and Groq HTTP calls; Node's built-in `crypto` module is used
for AES-256-GCM key encryption and randomized credit costs.

| Package | License |
|---|---|
| `@swisseph/node` | **AGPL-3.0** (see obligations above) |
| `@swisseph/core` (transitive) | AGPL-3.0 |
| express | MIT |
| mongoose | MIT |
| axios | MIT |
| luxon | MIT |
| helmet | MIT |
| cors | MIT |
| express-rate-limit | MIT |
| express-validator | MIT |
| bcryptjs | BSD-3-Clause |
| jsonwebtoken | MIT |
| dotenv | BSD-2-Clause |

See `THIRD_PARTY_NOTICES.md` for the full required Swiss Ephemeris notice.
No proprietary code, assets, or documentation from any third party has been
copied into this repository. Gemini API usage is subject to
[Google's Gemini API Terms of Service](https://ai.google.dev/gemini-api/terms),
and Groq API usage to [Groq's Terms of Service](https://groq.com/terms-of-service/)
— a separate matter from this repo's own AGPL-3.0 licensing, since both
are called over the network as external services, not bundled/linked
into this codebase.

## What this project includes vs. deliberately excludes

**Included:** Kundli calculation, current transit, a Chat API with a
backend-enforced daily credit system and automatic multi-key/multi-provider
(Gemini + Groq) AI fallback, and an API-only admin panel (stats, Kundli
management, encrypted AI key management, editable prompt settings) — all
as detailed above.

**Still deliberately excluded**, per the original spec: the Flutter app
itself, any admin **UI** (the admin *API* exists; no frontend does), any
ads SDK integration (the rewarded-ad *flow* is client-side and out of
scope — only the backend credit-granting endpoint for it exists here),
payments, and real authentication/accounts on the **public** Kundli/Chat
surface — `kundliId` there is still an opaque identifier, not an account
system. (The admin surface, `/api/admin/*`, does have real JWT
authentication — see the Security section above for exactly what each
part does and doesn't protect against.)
