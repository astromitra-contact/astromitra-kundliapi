'use strict';

const { DateTime } = require('luxon');
const AppError = require('../utils/AppError');

/**
 * Convert a local birth date + time in a given IANA timezone into UTC.
 *
 * This uses Luxon (backed by the IANA tz database) rather than a fixed
 * UTC-offset lookup, because a fixed offset is only correct for "right now".
 * A birth date in, say, 1985 may fall under different DST/offset rules than
 * today for the same city, and Luxon's tz-database-driven conversion
 * accounts for that automatically for any historical date the tz database
 * covers.
 *
 * @param {string} dateOfBirth - "YYYY-MM-DD"
 * @param {string} timeOfBirth - "HH:mm" (24-hour, local clock time at birth place)
 * @param {string} timezoneId - IANA timezone, e.g. "Asia/Kolkata"
 */
function localToUtc(dateOfBirth, timeOfBirth, timezoneId) {
  const isoLocal = `${dateOfBirth}T${timeOfBirth}:00`;
  const local = DateTime.fromISO(isoLocal, { zone: timezoneId });

  if (!local.isValid) {
    throw new AppError(
      `Could not interpret birth date/time "${dateOfBirth} ${timeOfBirth}" in timezone ` +
        `"${timezoneId}": ${local.invalidReason} - ${local.invalidExplanation}`,
      422,
      'INVALID_LOCAL_TIME'
    );
  }

  const utc = local.toUTC();

  return {
    localIso: local.toISO(),
    utcIso: utc.toISO(),
    utcDate: utc.toJSDate(),
    utcOffsetMinutes: local.offset, // minutes east of UTC at the moment of birth (DST-aware)
    isDST: local.isInDST,
    timezoneId,
  };
}

module.exports = { localToUtc };
