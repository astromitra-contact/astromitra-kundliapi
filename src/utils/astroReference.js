'use strict';

/**
 * These are fixed, universally-standard naming tables used only to LABEL
 * longitudes that Swiss Ephemeris actually calculates. No astrological
 * position, degree, or chart value is invented or hard-coded here — only
 * the names of the 12 zodiac signs and 27 nakshatras, each of which always
 * occupies a fixed 30° / 13°20' slice of the 360° ecliptic.
 */

const RASHIS = [
  { index: 0, name: 'Mesha', english: 'Aries', lord: 'Mars' },
  { index: 1, name: 'Vrishabha', english: 'Taurus', lord: 'Venus' },
  { index: 2, name: 'Mithuna', english: 'Gemini', lord: 'Mercury' },
  { index: 3, name: 'Karka', english: 'Cancer', lord: 'Moon' },
  { index: 4, name: 'Simha', english: 'Leo', lord: 'Sun' },
  { index: 5, name: 'Kanya', english: 'Virgo', lord: 'Mercury' },
  { index: 6, name: 'Tula', english: 'Libra', lord: 'Venus' },
  { index: 7, name: 'Vrishchika', english: 'Scorpio', lord: 'Mars' },
  { index: 8, name: 'Dhanu', english: 'Sagittarius', lord: 'Jupiter' },
  { index: 9, name: 'Makara', english: 'Capricorn', lord: 'Saturn' },
  { index: 10, name: 'Kumbha', english: 'Aquarius', lord: 'Saturn' },
  { index: 11, name: 'Meena', english: 'Pisces', lord: 'Jupiter' },
];

const NAKSHATRAS = [
  { index: 0, name: 'Ashwini', lord: 'Ketu' },
  { index: 1, name: 'Bharani', lord: 'Venus' },
  { index: 2, name: 'Krittika', lord: 'Sun' },
  { index: 3, name: 'Rohini', lord: 'Moon' },
  { index: 4, name: 'Mrigashira', lord: 'Mars' },
  { index: 5, name: 'Ardra', lord: 'Rahu' },
  { index: 6, name: 'Punarvasu', lord: 'Jupiter' },
  { index: 7, name: 'Pushya', lord: 'Saturn' },
  { index: 8, name: 'Ashlesha', lord: 'Mercury' },
  { index: 9, name: 'Magha', lord: 'Ketu' },
  { index: 10, name: 'Purva Phalguni', lord: 'Venus' },
  { index: 11, name: 'Uttara Phalguni', lord: 'Sun' },
  { index: 12, name: 'Hasta', lord: 'Moon' },
  { index: 13, name: 'Chitra', lord: 'Mars' },
  { index: 14, name: 'Swati', lord: 'Rahu' },
  { index: 15, name: 'Vishakha', lord: 'Jupiter' },
  { index: 16, name: 'Anuradha', lord: 'Saturn' },
  { index: 17, name: 'Jyeshtha', lord: 'Mercury' },
  { index: 18, name: 'Mula', lord: 'Ketu' },
  { index: 19, name: 'Purva Ashadha', lord: 'Venus' },
  { index: 20, name: 'Uttara Ashadha', lord: 'Sun' },
  { index: 21, name: 'Shravana', lord: 'Moon' },
  { index: 22, name: 'Dhanishta', lord: 'Mars' },
  { index: 23, name: 'Shatabhisha', lord: 'Rahu' },
  { index: 24, name: 'Purva Bhadrapada', lord: 'Jupiter' },
  { index: 25, name: 'Uttara Bhadrapada', lord: 'Saturn' },
  { index: 26, name: 'Revati', lord: 'Mercury' },
];

const RASHI_SPAN_DEG = 30;
const NAKSHATRA_SPAN_DEG = 360 / 27; // 13°20'
const PADA_SPAN_DEG = NAKSHATRA_SPAN_DEG / 4; // 3°20'

/** Normalize any longitude into the [0, 360) range. */
function normalizeDegrees(deg) {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}

/** Given a sidereal ecliptic longitude, return its Rashi (zodiac sign). */
function getRashi(longitude) {
  const lon = normalizeDegrees(longitude);
  const index = Math.floor(lon / RASHI_SPAN_DEG);
  const degreeInSign = lon - index * RASHI_SPAN_DEG;
  return { ...RASHIS[index], degreeInSign };
}

/** Given a sidereal ecliptic longitude, return its Nakshatra and Pada. */
function getNakshatra(longitude) {
  const lon = normalizeDegrees(longitude);
  const nakIndex = Math.floor(lon / NAKSHATRA_SPAN_DEG);
  const degreeInNakshatra = lon - nakIndex * NAKSHATRA_SPAN_DEG;
  const pada = Math.floor(degreeInNakshatra / PADA_SPAN_DEG) + 1;
  return { ...NAKSHATRAS[nakIndex], pada, degreeInNakshatra };
}

module.exports = {
  RASHIS,
  NAKSHATRAS,
  RASHI_SPAN_DEG,
  NAKSHATRA_SPAN_DEG,
  PADA_SPAN_DEG,
  normalizeDegrees,
  getRashi,
  getNakshatra,
};
