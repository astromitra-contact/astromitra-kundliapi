'use strict';

const swisseph = require('@swisseph/node');
const { Planet, LunarPoint, HouseSystem, CalculationFlag, SiderealMode } = swisseph;

const {
  RASHIS,
  getRashi,
  getNakshatra,
  normalizeDegrees,
} = require('../utils/astroReference');
const AppError = require('../utils/AppError');

// ---------------------------------------------------------------------------
// Fixed calculation settings for this API.
// Ayanamsa: Lahiri (Chitrapaksha) — the most widely used ayanamsa in
// mainstream Vedic/Jyotish astrology and the de facto default for Kundli
// generation software.
// House system: Whole Sign (Rashi houses) — each of the 12 houses is exactly
// one zodiac sign wide, starting from the sign occupied by the Ascendant.
// This is the traditional house scheme used in Vedic Kundli charts.
// Lunar nodes: Mean Node (Rahu/Ketu) — the standard choice for Lahiri-based
// Vedic charts (as opposed to the "True Node" used in some Western systems).
// ---------------------------------------------------------------------------
const AYANAMSA_MODE = SiderealMode.Lahiri;
const AYANAMSA_NAME = 'Lahiri (Chitrapaksha)';
const HOUSE_SYSTEM = HouseSystem.WholeSign;
const HOUSE_SYSTEM_NAME = 'Whole Sign (Rashi)';
const NODE_TYPE = 'mean'; // Swiss Ephemeris LunarPoint.MeanNode

const SIDEREAL_PLANET_FLAGS = CalculationFlag.SwissEphemeris | CalculationFlag.Sidereal | CalculationFlag.Speed;
const TROPICAL_ANGLE_FLAGS = CalculationFlag.SwissEphemeris | CalculationFlag.Speed;

const PLANET_BODIES = [
  { key: 'sun', name: 'Sun', body: Planet.Sun },
  { key: 'moon', name: 'Moon', body: Planet.Moon },
  { key: 'mars', name: 'Mars', body: Planet.Mars },
  { key: 'mercury', name: 'Mercury', body: Planet.Mercury },
  { key: 'jupiter', name: 'Jupiter', body: Planet.Jupiter },
  { key: 'venus', name: 'Venus', body: Planet.Venus },
  { key: 'saturn', name: 'Saturn', body: Planet.Saturn },
];

/**
 * Compute the Julian Day (Universal Time) for a JS Date already in UTC.
 */
function toJulianDayUT(utcDate) {
  return swisseph.dateToJulianDay(utcDate);
}

/**
 * Get the Lahiri ayanamsa (in degrees) for a given Julian Day.
 * Must be called after setSiderealMode(); kept as its own step so the
 * exact ayanamsa value used is visible/returned in the API response
 * (transparency requirement — no hidden/hardcoded offsets).
 */
function getLahiriAyanamsa(jd) {
  swisseph.setSiderealMode(AYANAMSA_MODE);
  return swisseph.getAyanamsaExUt(jd, CalculationFlag.SwissEphemeris);
}

/**
 * Calculate the sidereal longitude/latitude/speed for a single planet.
 */
function calculateSiderealPlanet(jd, body) {
  swisseph.setSiderealMode(AYANAMSA_MODE);
  const pos = swisseph.calculatePosition(jd, body, SIDEREAL_PLANET_FLAGS);
  return pos;
}

/**
 * Calculate the sidereal Ascendant (Lagna) and MC for the given birth
 * moment/location, plus the tropical values and ayanamsa used to derive
 * them (for transparency/debuggability in the response).
 *
 * We take the tropical Ascendant/MC (which Swiss Ephemeris computes
 * directly from the horizon geometry — the same regardless of house
 * system) and subtract the Lahiri ayanamsa to get the sidereal values,
 * which is the standard method used by Vedic astrology software.
 */
function calculateAscendantAndMC(jd, latitude, longitude) {
  const tropicalHouses = swisseph.calculateHouses(jd, latitude, longitude, HouseSystem.Placidus);

  const ayanamsa = getLahiriAyanamsa(jd);

  const siderealAscendant = normalizeDegrees(tropicalHouses.ascendant - ayanamsa);
  const siderealMC = normalizeDegrees(tropicalHouses.mc - ayanamsa);

  return {
    ayanamsa,
    tropicalAscendant: tropicalHouses.ascendant,
    tropicalMC: tropicalHouses.mc,
    siderealAscendant,
    siderealMC,
  };
}

/**
 * Build the 12 Whole-Sign houses starting from the Ascendant's Rashi.
 * House 1 = the sign containing the sidereal Ascendant; each subsequent
 * house is the next sign in zodiacal order, exactly 30° wide.
 */
function buildWholeSignHouses(siderealAscendant) {
  const lagnaRashi = getRashi(siderealAscendant);
  const houses = [];

  for (let houseNumber = 1; houseNumber <= 12; houseNumber += 1) {
    const rashiIndex = (lagnaRashi.index + houseNumber - 1) % 12;
    const rashi = RASHIS[rashiIndex];
    houses.push({
      houseNumber,
      rashiIndex,
      rashi: rashi.name,
      rashiEnglish: rashi.english,
      rashiLord: rashi.lord,
      cuspLongitude: rashiIndex * 30, // sidereal, start of sign
    });
  }

  return { lagnaRashiIndex: lagnaRashi.index, houses };
}

/**
 * Given a planet's sidereal longitude and the Ascendant's Rashi index,
 * determine which of the 12 Whole-Sign houses it occupies (1-12).
 */
function getHouseNumberForLongitude(longitude, lagnaRashiIndex) {
  const rashi = getRashi(longitude);
  return ((rashi.index - lagnaRashiIndex + 12) % 12) + 1;
}

/**
 * Calculate sidereal positions for all 9 grahas (Sun...Saturn + Rahu/Ketu)
 * at a given Julian Day, with NO house placement attached yet (that
 * requires a Lagna, which requires a location — see getHouseNumberForLongitude).
 * Shared by both the birth-chart calculation and the transit calculation so
 * there is exactly one code path computing planetary positions.
 */
function computePlanetsList(jd) {
  const planets = [];

  for (const def of PLANET_BODIES) {
    const pos = calculateSiderealPlanet(jd, def.body);
    const rashi = getRashi(pos.longitude);
    const nakshatra = getNakshatra(pos.longitude);

    planets.push({
      key: def.key,
      name: def.name,
      longitude: pos.longitude,
      latitude: pos.latitude,
      distanceAU: pos.distance,
      speedLongitude: pos.longitudeSpeed,
      isRetrograde: pos.longitudeSpeed < 0,
      rashi: rashi.name,
      rashiEnglish: rashi.english,
      rashiLord: rashi.lord,
      degreeInRashi: rashi.degreeInSign,
      nakshatra: nakshatra.name,
      nakshatraLord: nakshatra.lord,
      pada: nakshatra.pada,
    });
  }

  // Rahu (mean lunar north node) — calculated directly.
  const rahuPos = calculateSiderealPlanet(jd, LunarPoint.MeanNode);
  const rahuRashi = getRashi(rahuPos.longitude);
  const rahuNakshatra = getNakshatra(rahuPos.longitude);

  planets.push({
    key: 'rahu',
    name: 'Rahu',
    longitude: rahuPos.longitude,
    latitude: rahuPos.latitude,
    distanceAU: rahuPos.distance,
    speedLongitude: rahuPos.longitudeSpeed,
    isRetrograde: rahuPos.longitudeSpeed < 0,
    rashi: rahuRashi.name,
    rashiEnglish: rahuRashi.english,
    rashiLord: rahuRashi.lord,
    degreeInRashi: rahuRashi.degreeInSign,
    nakshatra: rahuNakshatra.name,
    nakshatraLord: rahuNakshatra.lord,
    pada: rahuNakshatra.pada,
    note: 'Mean lunar North Node',
  });

  // Ketu (South Node) — always exactly 180° opposite Rahu. This is not an
  // independent Swiss Ephemeris body; per standard astronomical/astrological
  // convention it is derived as Rahu's longitude + 180°.
  const ketuLongitude = normalizeDegrees(rahuPos.longitude + 180);
  const ketuRashi = getRashi(ketuLongitude);
  const ketuNakshatra = getNakshatra(ketuLongitude);

  planets.push({
    key: 'ketu',
    name: 'Ketu',
    longitude: ketuLongitude,
    latitude: -rahuPos.latitude,
    distanceAU: rahuPos.distance,
    speedLongitude: rahuPos.longitudeSpeed,
    isRetrograde: rahuPos.longitudeSpeed < 0,
    rashi: ketuRashi.name,
    rashiEnglish: ketuRashi.english,
    rashiLord: ketuRashi.lord,
    degreeInRashi: ketuRashi.degreeInSign,
    nakshatra: ketuNakshatra.name,
    nakshatraLord: ketuNakshatra.lord,
    pada: ketuNakshatra.pada,
    note: 'Mean lunar South Node (180° opposite Rahu)',
  });

  return planets;
}

/**
 * Full Kundli calculation for a given UTC birth instant + location.
 * This is the single entry point the rest of the app should use — it does
 * not do any I/O (no network, no DB); it is pure computation over
 * Swiss Ephemeris.
 */
function calculateKundli({ utcDate, latitude, longitude }) {
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || Number.isNaN(latitude) || Number.isNaN(longitude)) {
    throw new AppError('Invalid coordinates supplied for calculation.', 400, 'INVALID_COORDINATES');
  }

  const jd = toJulianDayUT(utcDate);

  // --- Ascendant / Lagna + Whole-Sign house framework ---------------------
  const { ayanamsa, tropicalAscendant, tropicalMC, siderealAscendant, siderealMC } =
    calculateAscendantAndMC(jd, latitude, longitude);

  const { lagnaRashiIndex, houses } = buildWholeSignHouses(siderealAscendant);
  const lagnaRashi = getRashi(siderealAscendant);
  const lagnaNakshatra = getNakshatra(siderealAscendant);

  const lagna = {
    longitude: siderealAscendant,
    tropicalLongitude: tropicalAscendant,
    rashi: lagnaRashi.name,
    rashiEnglish: lagnaRashi.english,
    rashiLord: lagnaRashi.lord,
    degreeInRashi: lagnaRashi.degreeInSign,
    nakshatra: lagnaNakshatra.name,
    nakshatraLord: lagnaNakshatra.lord,
    pada: lagnaNakshatra.pada,
    houseNumber: 1,
  };

  // --- Planets --------------------------------------------------------------
  const planets = computePlanetsList(jd);
  for (const p of planets) {
    p.houseNumber = getHouseNumberForLongitude(p.longitude, lagnaRashiIndex);
  }

  const moonEntry = planets.find((p) => p.key === 'moon');

  return {
    julianDayUT: jd,
    calculationSettings: {
      zodiac: 'sidereal',
      ayanamsa: AYANAMSA_NAME,
      ayanamsaValue: ayanamsa,
      houseSystem: HOUSE_SYSTEM_NAME,
      houseSystemCode: HOUSE_SYSTEM,
      nodeType: NODE_TYPE,
      ephemeris: 'Swiss Ephemeris (bundled .se1 files)',
      mc: {
        siderealLongitude: siderealMC,
        tropicalLongitude: tropicalMC,
      },
    },
    lagna,
    houses,
    planets,
    nakshatras: {
      moon: {
        nakshatra: moonEntry.nakshatra,
        lord: moonEntry.nakshatraLord,
        pada: moonEntry.pada,
        rashi: moonEntry.rashi,
      },
      ascendant: {
        nakshatra: lagna.nakshatra,
        lord: lagna.nakshatraLord,
        pada: lagna.pada,
        rashi: lagna.rashi,
      },
    },
  };
}

/**
 * Current/any-moment planetary transit (Gochar) positions.
 *
 * If latitude+longitude are given, also returns the sidereal Lagna and
 * Whole-Sign houses for that moment/location, so transit planets' house
 * placement relative to that Ascendant can be shown (useful for showing
 * gochar relative to a chosen chart, e.g. a business's or a place's
 * ascendant). If no location is given, only planetary Rashi/Nakshatra
 * positions are returned — sufficient for basic transit lookups like
 * "which sign is Saturn/Jupiter in right now".
 *
 * This uses the exact same computePlanetsList()/calculateAscendantAndMC()
 * functions as the birth-chart calculation — no separate/duplicated
 * ephemeris logic.
 */
function calculateTransit({ utcDate, latitude, longitude }) {
  const jd = toJulianDayUT(utcDate);
  const hasLocation =
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    !Number.isNaN(latitude) &&
    !Number.isNaN(longitude);

  if (!hasLocation) {
    const ayanamsa = getLahiriAyanamsa(jd);
    const planets = computePlanetsList(jd);

    return {
      julianDayUT: jd,
      calculationSettings: {
        zodiac: 'sidereal',
        ayanamsa: AYANAMSA_NAME,
        ayanamsaValue: ayanamsa,
        houseSystem: null,
        houseSystemCode: null,
        nodeType: NODE_TYPE,
        ephemeris: 'Swiss Ephemeris (bundled .se1 files)',
      },
      lagna: null,
      houses: null,
      planets,
    };
  }

  // Location given -> reuse the full birth-chart pipeline (same engine).
  const full = calculateKundli({ utcDate, latitude, longitude });
  return {
    julianDayUT: full.julianDayUT,
    calculationSettings: full.calculationSettings,
    lagna: full.lagna,
    houses: full.houses,
    planets: full.planets,
  };
}

module.exports = {
  calculateKundli,
  calculateTransit,
  toJulianDayUT,
};
