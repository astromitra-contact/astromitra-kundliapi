'use strict';

const swisseph = require('@swisseph/node');
const { RASHIS, NAKSHATRAS, normalizeDegrees, getRashi, getNakshatra } = require('../utils/astroReference');
const astrologyService = require('./astrology.service');
const kundliService = require('./kundli.service');
const aiProviderService = require('./ai/aiProvider.service');
const AppError = require('../utils/AppError');

// In-memory cache for daily horoscopes (keyed by date:sign:kundliId)
const horoscopeCache = new Map();

// 12 Zodiac signs metadata
const ZODIAC_SIGNS = [
  {
    index: 0,
    rashi: 'Mesha',
    english: 'Aries',
    symbol: '♈',
    element: 'Fire',
    quality: 'Movable (Chara)',
    lord: 'Mars',
    dates: 'Mar 21 - Apr 19',
    luckyColors: ['Crimson Red', 'Scarlet', 'Coral'],
    luckyNumbers: [9, 18, 27],
  },
  {
    index: 1,
    rashi: 'Vrishabha',
    english: 'Taurus',
    symbol: '♉',
    element: 'Earth',
    quality: 'Fixed (Sthira)',
    lord: 'Venus',
    dates: 'Apr 20 - May 20',
    luckyColors: ['Emerald Green', 'Royal Blue', 'Cream White'],
    luckyNumbers: [6, 15, 24],
  },
  {
    index: 2,
    rashi: 'Mithuna',
    english: 'Gemini',
    symbol: '♊',
    element: 'Air',
    quality: 'Dual (Dvisvabhava)',
    lord: 'Mercury',
    dates: 'May 21 - Jun 20',
    luckyColors: ['Bright Yellow', 'Pistachio Green', 'Light Orange'],
    luckyNumbers: [5, 14, 23],
  },
  {
    index: 3,
    rashi: 'Karka',
    english: 'Cancer',
    symbol: '♋',
    element: 'Water',
    quality: 'Movable (Chara)',
    lord: 'Moon',
    dates: 'Jun 21 - Jul 22',
    luckyColors: ['Pearl White', 'Silver', 'Sea Green'],
    luckyNumbers: [2, 11, 20],
  },
  {
    index: 4,
    rashi: 'Simha',
    english: 'Leo',
    symbol: '♌',
    element: 'Fire',
    quality: 'Fixed (Sthira)',
    lord: 'Sun',
    dates: 'Jul 23 - Aug 22',
    luckyColors: ['Golden Yellow', 'Orange', 'Amber'],
    luckyNumbers: [1, 10, 19],
  },
  {
    index: 5,
    rashi: 'Kanya',
    english: 'Virgo',
    symbol: '♍',
    element: 'Earth',
    quality: 'Dual (Dvisvabhava)',
    lord: 'Mercury',
    dates: 'Aug 23 - Sep 22',
    luckyColors: ['Forest Green', 'Navy Blue', 'Beige'],
    luckyNumbers: [5, 14, 23],
  },
  {
    index: 6,
    rashi: 'Tula',
    english: 'Libra',
    symbol: '♎',
    element: 'Air',
    quality: 'Movable (Chara)',
    lord: 'Venus',
    dates: 'Sep 23 - Oct 22',
    luckyColors: ['Sky Blue', 'Pastel Pink', 'Lavender'],
    luckyNumbers: [6, 15, 24],
  },
  {
    index: 7,
    rashi: 'Vrishchika',
    english: 'Scorpio',
    symbol: '♏',
    element: 'Water',
    quality: 'Fixed (Sthira)',
    lord: 'Mars',
    dates: 'Oct 23 - Nov 21',
    luckyColors: ['Deep Maroon', 'Black', 'Dark Crimson'],
    luckyNumbers: [9, 18, 27],
  },
  {
    index: 8,
    rashi: 'Dhanu',
    english: 'Sagittarius',
    symbol: '♐',
    element: 'Fire',
    quality: 'Dual (Dvisvabhava)',
    lord: 'Jupiter',
    dates: 'Nov 22 - Dec 21',
    luckyColors: ['Saffron', 'Bright Yellow', 'Purple'],
    luckyNumbers: [3, 12, 21],
  },
  {
    index: 9,
    rashi: 'Makara',
    english: 'Capricorn',
    symbol: '♑',
    element: 'Earth',
    quality: 'Movable (Chara)',
    lord: 'Saturn',
    dates: 'Dec 22 - Jan 19',
    luckyColors: ['Charcoal Grey', 'Dark Blue', 'Indigo'],
    luckyNumbers: [8, 17, 26],
  },
  {
    index: 10,
    rashi: 'Kumbha',
    english: 'Aquarius',
    symbol: '♒',
    element: 'Air',
    quality: 'Fixed (Sthira)',
    lord: 'Saturn',
    dates: 'Jan 20 - Feb 18',
    luckyColors: ['Electric Blue', 'Cyan', 'Steel Grey'],
    luckyNumbers: [8, 17, 26],
  },
  {
    index: 11,
    rashi: 'Meena',
    english: 'Pisces',
    symbol: '♓',
    element: 'Water',
    quality: 'Dual (Dvisvabhava)',
    lord: 'Jupiter',
    dates: 'Feb 19 - Mar 20',
    luckyColors: ['Sea Green', 'Golden Yellow', 'Aqua'],
    luckyNumbers: [3, 12, 21],
  },
];

const TITHI_NAMES = [
  'Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami',
  'Shashthi', 'Saptami', 'Ashtami', 'Navami', 'Dashami',
  'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi', 'Purnima / Amavasya'
];

const DAY_RULERS = [
  { day: 'Sunday', lord: 'Sun', auspiciousTimes: '09:00 AM - 10:30 AM' },
  { day: 'Monday', lord: 'Moon', auspiciousTimes: '10:30 AM - 12:00 PM' },
  { day: 'Tuesday', lord: 'Mars', auspiciousTimes: '02:00 PM - 03:30 PM' },
  { day: 'Wednesday', lord: 'Mercury', auspiciousTimes: '11:00 AM - 12:30 PM' },
  { day: 'Thursday', lord: 'Jupiter', auspiciousTimes: '09:30 AM - 11:00 AM' },
  { day: 'Friday', lord: 'Venus', auspiciousTimes: '04:00 PM - 05:30 PM' },
  { day: 'Saturday', lord: 'Saturn', auspiciousTimes: '08:00 AM - 09:30 AM' },
];

function findSign(identifier) {
  if (identifier === undefined || identifier === null) return ZODIAC_SIGNS[0];
  const str = String(identifier).trim().toLowerCase();
  const num = parseInt(str, 10);
  if (!isNaN(num) && num >= 0 && num < 12) {
    return ZODIAC_SIGNS[num];
  }
  const match = ZODIAC_SIGNS.find(
    (s) => s.english.toLowerCase() === str || s.rashi.toLowerCase() === str
  );
  return match || ZODIAC_SIGNS[0];
}

function calculatePanchang(transitPlanets, utcDate) {
  const moon = transitPlanets.find((p) => p.key === 'moon') || transitPlanets[1];
  const sun = transitPlanets.find((p) => p.key === 'sun') || transitPlanets[0];

  const moonLon = moon ? moon.longitude : 0;
  const sunLon = sun ? sun.longitude : 0;

  // Diff between Moon and Sun in degrees
  const angleDiff = normalizeDegrees(moonLon - sunLon);
  const tithiIndex = Math.floor(angleDiff / 12);
  const paksha = tithiIndex < 15 ? 'Shukla Paksha' : 'Krishna Paksha';
  const tithiName = `${paksha} ${TITHI_NAMES[tithiIndex % 15]}`;

  const dayOfWeek = DAY_RULERS[utcDate.getUTCDay()];

  return {
    tithi: tithiName,
    nakshatra: moon ? moon.nakshatra : 'Pushya',
    nakshatraLord: moon ? moon.nakshatraLord : 'Saturn',
    dayName: dayOfWeek.day,
    dayLord: dayOfWeek.lord,
    auspiciousTime: dayOfWeek.auspiciousTimes,
  };
}

/**
 * Vedic Chandra Gochar (Moon transit relative to natal sign) rule engine.
 * Generates accurate and deep predictions based on classical Jyotish principles.
 */
function generateVedicHoroscope({ signMeta, moonHouse, panchang, transitPlanets, userName, lagnaSign, targetDate }) {
  const utcDate = targetDate || new Date();
  const { rashi, english, lord, element, luckyColors, luckyNumbers } = signMeta;
  const moonPlanet = transitPlanets.find((p) => p.key === 'moon');
  const moonRashi = moonPlanet ? moonPlanet.rashiEnglish : '';

  // House-specific interpretations according to Chandra Gochar
  const interpretations = {
    1: {
      theme: 'Self-Realization & Mental Vitality',
      overview: `The Moon transits directly through your sign (${english}) today, bringing high emotional clarity, magnetic personal appeal, and a renewed sense of self-confidence. You feel refreshed and mentally centered to take the lead in personal affairs.`,
      love: `Your warmth and affectionate demeanor shine brightly today. Openhearted conversations with your partner will deepen mutual understanding. Singles may attract admiring glances effortlessly.`,
      career: `Take decisive initiative on projects that require your personal touch and creative vision. Colleagues and superiors will be receptive to your ideas and executive presence.`,
      finance: `A favorable day to evaluate financial plans and investments for personal growth. Avoid impulsive shopping driven by momentary moods; focus on long-term value.`,
      health: `Your energy levels are elevated. Channel this vitality into a wholesome physical workout, refreshing walk, or yoga session to keep your mind and body in perfect alignment.`,
      cosmicTip: `Trust your first instincts today. Stand tall in your convictions and express your authentic self without hesitation.`,
      scores: { overall: 92, love: 88, career: 90, health: 86, finance: 85 },
    },
    2: {
      theme: 'Wealth Accumulation & Family Harmony',
      overview: `The Moon transits your 2nd House (Dhana Bhava), highlighting domestic matters, family gatherings, and financial transactions. Your words carry persuasive weight, making it an excellent time for negotiations.`,
      love: `Sweetness in speech will resolve any past misunderstandings with loved ones. A quiet dinner or family celebration brings comfort and joy to your romantic bond.`,
      career: `Discussions around budget allocations, compensation, or client presentations go favorably. Focus on organizing your workspace and consolidating data.`,
      finance: `Strong indications of steady gains or unexpected financial assistance. A disciplined approach to your expenditure will yield excellent peace of mind.`,
      health: `Pay attention to your diet and hydration. Opt for nourishing, home-cooked meals and protect your throat and vocal cords from excessive strain.`,
      cosmicTip: `Speak with mindfulness and kindness. Your words have healing and constructive power today.`,
      scores: { overall: 86, love: 85, career: 84, health: 80, finance: 92 },
    },
    3: {
      theme: 'Courage, Initiative & Dynamic Communication',
      overview: `The Moon graces your 3rd House (Sahaja Bhava), igniting strong willpower, courage, and motivation. Short travels, messaging, networking, and creative expressions receive cosmic blessings today.`,
      love: `Flirtatious banter and playful communication brighten up your relationship. If you're single, an intriguing message or conversation through social channels could spark mutual interest.`,
      career: `Your multitasking capability is exceptional. Pitch new concepts, write proposals, or make important phone calls. Sibling or junior colleague support aids your progress.`,
      finance: `Short-term ventures or commission-based efforts show positive signs. Moderate spending on technical tools or communication devices proves worthwhile.`,
      health: `High mental stamina keeps you alert throughout the day. Take brief posture breaks if you spend long hours at a screen or on the road.`,
      cosmicTip: `Take the first step on a task you've postponed. Momentum is completely on your side today.`,
      scores: { overall: 90, love: 82, career: 93, health: 88, finance: 84 },
    },
    4: {
      theme: 'Inner Peace, Comfort & Domestic Sanctuary',
      overview: `The Moon visits your 4th House (Sukha Bhava), drawing your attention toward home, vehicles, emotional security, and connection with maternal figures. Give yourself space to unwind and recharge.`,
      love: `A cozy and intimate setting brings profound comfort. Share your vulnerabilities with someone you trust; mutual empathy will bring you closer than ever.`,
      career: `Focus on background planning, research, and setting solid foundations rather than aggressive expansion. Your patience will prevent unneeded workplace friction.`,
      finance: `Expenditure may relate to home improvement, furnishings, or family welfare. These investments enhance your living quality and bring lasting satisfaction.`,
      health: `Prioritize emotional well-being and restorative sleep. A warm bath, calming herbal tea, or meditation will dissolve lingering mental tension.`,
      cosmicTip: `Create a peaceful sanctuary in your living space. Stillness inside leads to clarity outside.`,
      scores: { overall: 82, love: 86, career: 78, health: 82, finance: 80 },
    },
    5: {
      theme: 'Creativity, Romance & Intellectual Brilliance',
      overview: `The Moon illuminates your 5th House (Putra & Purvapunya Bhava), fostering sharp intellect, artistic inspiration, and romantic warmth. Your intuition is tuned to creative solutions and joyful moments.`,
      love: `Romance flourishes with passion and playful charm. Plan a memorable date, exchange heartfelt gifts, or express your feelings with creative gestures.`,
      career: `Your analytical foresight and innovative proposals impress decision-makers. Ideal for speculative brainstorming, design work, and intellectual pursuits.`,
      finance: `Calculated risks or creative investments can show promise. However, balance enthusiasm with prudent risk management before committing large funds.`,
      health: `Spirits are buoyant and cheerful. Engage in sports, dancing, or creative hobbies that stimulate your heart and bring spontaneous laughter.`,
      cosmicTip: `Celebrate your unique creative gifts. Joy is your highest vibration today.`,
      scores: { overall: 91, love: 94, career: 88, health: 87, finance: 86 },
    },
    6: {
      theme: 'Triumph Over Obstacles & Health Mastery',
      overview: `The Moon moves into your 6th House (Shatru & Roga Bhava), granting you the determination to overcome hurdles, resolve pending disputes, and streamline daily routines with razor-sharp efficiency.`,
      love: `Show love through practical support and acts of service. Helping your partner handle a challenging chore will build immense appreciation and goodwill.`,
      career: `You possess the endurance to tackle demanding tasks and outshine competitors. Legal or bureaucratic matters move toward resolution under your diligent scrutiny.`,
      finance: `Favorable day to settle pending debts, audit accounts, or negotiate competitive rates on services. Prudence shields you from avoidable liabilities.`,
      health: `An ideal day to reset diet habits, take vitamins, and stick strictly to a workout regime. Your body responds remarkably well to disciplined care.`,
      cosmicTip: `Tackle the most demanding item on your to-do list early. Victory over small hurdles clears the path to victory.`,
      scores: { overall: 85, love: 76, career: 91, health: 89, finance: 88 },
    },
    7: {
      theme: 'Partnership Harmony, Alliances & Public Grace',
      overview: `The Moon shines in your 7th House (Kalatra Bhava), emphasizing one-on-one relationships, business alliances, and public reputation. Collaboration brings far greater results than solitary struggle.`,
      love: `Harmony and mutual respect are heightened. Deepen your commitment with your significant other. Single individuals may encounter someone with complementary traits.`,
      career: `Contracts, partnerships, and team agreements receive positive cosmic backing. Listen actively to clients and partners to forge mutually lucrative solutions.`,
      finance: `Joint ventures and collaborative financial discussions proceed smoothly. Ensure agreements are clearly documented to maintain transparent expectations.`,
      health: `Maintain balance in your social and personal hours. Gentle stretching, partner workouts, or a scenic stroll will keep your vitality balanced.`,
      cosmicTip: `Seek win-win outcomes in every encounter. Together you achieve what neither could alone.`,
      scores: { overall: 89, love: 92, career: 87, health: 84, finance: 86 },
    },
    8: {
      theme: 'Transformation, Intuition & Deep Wisdom',
      overview: `The Moon transits your 8th House (Ayur & Randhra Bhava), opening doors to deep introspection, esoteric curiosity, and spiritual discovery. Approach day-to-day interactions with measured calmness and patience.`,
      love: `Intense emotional currents may surface. Avoid unnecessary arguments over minor details; focus instead on profound spiritual and emotional bonding.`,
      career: `Ideal for deep research, data investigation, confidential planning, and uncovering hidden insights. Avoid rash decisions or confrontation with authorities.`,
      finance: `Matters related to insurance, inheritance, or shared assets come into focus. Hold off on major speculative gambles until clearer transits emerge.`,
      health: `Conserve your nervous energy. Prioritize meditation, breathwork (Pranayama), and restorative quiet time away from noisy crowds.`,
      cosmicTip: `Embrace life's transformative cycles. When you release what no longer serves you, wisdom takes its place.`,
      scores: { overall: 76, love: 75, career: 79, health: 76, finance: 74 },
    },
    9: {
      theme: 'Spiritual Fortune, Higher Wisdom & Luck',
      overview: `The Moon arrives in your 9th House (Bhagya Bhava), showering divine grace, optimism, and philosophical expansion. Fortune favors ethical endeavors, mentoring, and higher learning today.`,
      love: `Shared spiritual or philosophical viewpoints bring a beautiful, soulful connection with your partner. Travel dreams or long-range plans inspire both of you.`,
      career: `Mentors, senior executives, or educational institutions offer valuable guidance. Great time for publishing, broad strategy formulation, and global projects.`,
      finance: `Auspicious day for long-term investments, charitable deeds (Daan), or planning future wealth-building vehicles. Ethical wealth generation attracts abundance.`,
      health: `A strong sense of purpose infuses you with positive vitality. Spending time outdoors under natural sunlight will rejuvenate your energy field.`,
      cosmicTip: `Keep your faith strong and your vision broad. The universe is aligning circumstances in your favor.`,
      scores: { overall: 94, love: 89, career: 92, health: 91, finance: 90 },
    },
    10: {
      theme: 'Professional Eminence & Leadership Recognition',
      overview: `The Moon culminates in your 10th House (Karma Bhava), placing your talents and leadership under the spotlight. Your dedication and professional reputation receive well-deserved admiration.`,
      love: `Balancing career commitments with romance is key today. A supportive partner will celebrate your achievements, while a brief sweet gesture keeps warmth alive.`,
      career: `Outstanding opportunities for advancement, public presentations, and taking command of strategic initiatives. Your authority is acknowledged and respected.`,
      finance: `Career success translates into potential long-term financial enhancement. Review career milestones and set ambitious professional revenue goals.`,
      health: `Energy is strong, but guard against professional fatigue. Maintain good posture and incorporate short relaxing breaks into your busy schedule.`,
      cosmicTip: `Step into your leadership role with dignity and humility. Your exemplary work speaks louder than words.`,
      scores: { overall: 93, love: 81, career: 96, health: 85, finance: 91 },
    },
    11: {
      theme: 'Fulfillment of Desires, Gains & Wide Networks',
      overview: `The Moon graces your 11th House (Labha Bhava), the house of supreme gains and wish fulfillment. Social circles, influential friends, and collaborative groups propel your ambitions forward.`,
      love: `A delightful day for social outings and couple gatherings with mutual friends. Singles could meet someone fascinating through an intellectual or community group.`,
      career: `Team projects thrive and your networking acumen pays off handsomely. Share your visions with associates; collective momentum ensures great success.`,
      finance: `Highly auspicious for financial growth, profits from previous investments, or bonus recognition. Multiple avenues of gain present themselves.`,
      health: `High enthusiasm and social happiness keep stress at bay. Enjoy active group sports or outdoor social events with your close circle.`,
      cosmicTip: `Visualize your highest dreams clearly. The universe is actively assisting in their manifestation.`,
      scores: { overall: 95, love: 89, career: 94, health: 90, finance: 96 },
    },
    12: {
      theme: 'Spiritual Solitude, Rest & Inner Renewal',
      overview: `The Moon traverses your 12th House (Vyaya & Moksha Bhava), signaling a period of rest, meditation, foreign affairs, and compassionate deeds. Retreat from chaos to connect with your higher consciousness.`,
      love: `Gentle, unspoken understanding holds the most beauty today. Avoid pushing for immediate answers; quiet companionship speaks volumes.`,
      career: `Best suited for solitary work, creative writing, overseas correspondence, and finishing up unresolved loose ends without rushing new launches.`,
      finance: `Watch out for incidental or charitable expenses. Conscious spending on spiritual books, wellness retreats, or helping someone in need brings inner peace.`,
      health: `Give priority to deep, uninterrupted sleep and mental peace. Unplug from digital screens at least an hour before bedtime to soothe the nervous system.`,
      cosmicTip: `Allow yourself the luxury of quiet contemplation. Silence heals what noise cannot touch.`,
      scores: { overall: 78, love: 77, career: 78, health: 79, finance: 75 },
    },
  };

  const selected = interpretations[moonHouse] || interpretations[1];

  // Pick lucky parameters
  const colorIndex = (utcDate.getUTCDate() + signMeta.index) % luckyColors.length;
  const luckyColor = luckyColors[colorIndex];

  const numberIndex = (utcDate.getUTCDate() + signMeta.index) % luckyNumbers.length;
  const luckyNumber = luckyNumbers[numberIndex];

  return {
    theme: selected.theme,
    overview: selected.overview,
    love: selected.love,
    career: selected.career,
    finance: selected.finance,
    health: selected.health,
    cosmicTip: selected.cosmicTip,
    scores: selected.scores,
    luckyColor,
    luckyNumber,
    luckyTime: panchang.auspiciousTime,
    moonHouse,
    transitSummary: `Moon transits in ${moonRashi} (House ${moonHouse} from your ${rashi} Rashi).`,
  };
}

/**
 * Attempts an AI-enhanced prediction if AI keys are configured and working.
 * Falls back gracefully to the classical Vedic engine if AI is unavailable.
 */
async function tryAiEnhancement({ signMeta, moonHouse, panchang, transitPlanets, userName, kundliId }) {
  try {
    const prompt = `You are AstroMitra, an expert Vedic astrologer. Generate a concise, deeply insightful, uplifting daily horoscope for today.
Target Zodiac Sign: ${signMeta.english} (${signMeta.rashi})
Ruling Planet: ${signMeta.lord}
Element: ${signMeta.element}
Current Transit: Moon is in House ${moonHouse} relative to this sign.
Day: ${panchang.dayName} (ruled by ${panchang.dayLord})
Tithi: ${panchang.tithi}, Nakshatra: ${panchang.nakshatra}
${userName ? `User's Name: ${userName}` : ''}

Respond with valid JSON ONLY in this exact format (no markdown, no backticks):
{
  "theme": "Short 3-5 word inspirational theme",
  "overview": "2-3 sentences overview of today's cosmic climate",
  "love": "2 sentences on relationships and emotions",
  "career": "2 sentences on work, goals and productivity",
  "finance": "2 sentences on money and spending",
  "health": "2 sentences on physical and mental energy",
  "cosmicTip": "One inspiring actionable advice or spiritual tip",
  "luckyColor": "Auspicious color",
  "luckyNumber": 7
}`;

    const aiResponse = await aiProviderService.askAI({ promptText: prompt, kundliId });
    if (!aiResponse) return null;

    // Clean JSON response
    const cleaned = aiResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (parsed.overview && parsed.love && parsed.career) {
      return parsed;
    }
  } catch (err) {
    // Non-fatal — AI failed or unavailable; Vedic engine will provide the reading.
    // console.warn('[horoscope.service] AI enhancement bypassed:', err.message);
  }
  return null;
}

/**
 * Main public entry point: Get Daily Horoscope for a given sign or kundliId.
 */
async function getDailyHoroscope({ sign, kundliId, date }) {
  let targetDate = date ? new Date(date) : new Date();
  if (isNaN(targetDate.getTime())) {
    targetDate = new Date();
  }

  // Format date key: YYYY-MM-DD
  const dateStr = targetDate.toISOString().slice(0, 10);

  let userName = null;
  let userMoonRashi = null;
  let userLagna = null;
  let isPersonalized = false;

  // 1. If kundliId provided, look up the user's birth chart
  if (kundliId) {
    try {
      const kundliDoc = await kundliService.getKundliById(kundliId);
      if (kundliDoc && kundliDoc.result) {
        isPersonalized = true;
        userName = kundliDoc.result.birthDetails?.name || null;
        userLagna = kundliDoc.result.lagna?.rashiEnglish || null;
        const moonPlanet = kundliDoc.result.planets?.find((p) => p.key === 'moon');
        if (moonPlanet) {
          userMoonRashi = moonPlanet.rashiEnglish;
          // If no specific sign was requested, default to their Janma Rashi!
          if (!sign) {
            sign = moonPlanet.rashiEnglish;
          }
        }
      }
    } catch (e) {
      // Continue with requested sign if DB lookup fails
    }
  }

  // 2. Resolve sign metadata
  const signMeta = findSign(sign || userMoonRashi || 'Aries');

  // Check cache
  const cacheKey = `horoscope:${dateStr}:${signMeta.english.toLowerCase()}:${kundliId || 'general'}`;
  if (horoscopeCache.has(cacheKey)) {
    return horoscopeCache.get(cacheKey);
  }

  // 3. Compute real-time planetary transits using Swiss Ephemeris
  const transit = astrologyService.calculateTransit({ utcDate: targetDate });
  const transitPlanets = transit.planets || [];

  // Calculate Moon's transit house from the sign's Rashi index
  const moonPlanet = transitPlanets.find((p) => p.key === 'moon') || transitPlanets[1];
  const moonRashiIndex = moonPlanet ? RASHIS.findIndex((r) => r.english === moonPlanet.rashiEnglish) : 0;
  const safeMoonIndex = moonRashiIndex >= 0 ? moonRashiIndex : 0;
  const moonHouse = ((safeMoonIndex - signMeta.index + 12) % 12) + 1;

  // 4. Calculate Panchang metrics for today
  const panchang = calculatePanchang(transitPlanets, targetDate);

  // 5. Generate Vedic astrological prediction
  const vedicReading = generateVedicHoroscope({
    signMeta,
    moonHouse,
    panchang,
    transitPlanets,
    userName,
    lagnaSign: userLagna,
    targetDate,
  });

  // 6. Optionally try AI enhancement if enabled
  const aiReading = await tryAiEnhancement({
    signMeta,
    moonHouse,
    panchang,
    transitPlanets,
    userName,
    kundliId,
  });

  const finalHoroscope = {
    date: dateStr,
    dayName: panchang.dayName,
    sign: signMeta.english,
    rashi: signMeta.rashi,
    symbol: signMeta.symbol,
    element: signMeta.element,
    quality: signMeta.quality,
    rashiLord: signMeta.lord,
    dates: signMeta.dates,
    isPersonalized,
    userName,
    userMoonRashi,
    userLagna,
    theme: (aiReading && aiReading.theme) || vedicReading.theme,
    overview: (aiReading && aiReading.overview) || vedicReading.overview,
    love: (aiReading && aiReading.love) || vedicReading.love,
    career: (aiReading && aiReading.career) || vedicReading.career,
    finance: (aiReading && aiReading.finance) || vedicReading.finance,
    health: (aiReading && aiReading.health) || vedicReading.health,
    cosmicTip: (aiReading && aiReading.cosmicTip) || vedicReading.cosmicTip,
    luckyColor: (aiReading && aiReading.luckyColor) || vedicReading.luckyColor,
    luckyNumber: (aiReading && aiReading.luckyNumber) || vedicReading.luckyNumber,
    luckyTime: vedicReading.luckyTime,
    scores: vedicReading.scores,
    transitDetails: {
      moonHouse,
      moonSign: moonPlanet ? moonPlanet.rashiEnglish : '',
      moonNakshatra: panchang.nakshatra,
      tithi: panchang.tithi,
      dayLord: panchang.dayLord,
      transitSummary: vedicReading.transitSummary,
    },
    allSigns: ZODIAC_SIGNS.map((s) => ({
      index: s.index,
      rashi: s.rashi,
      english: s.english,
      symbol: s.symbol,
      element: s.element,
      lord: s.lord,
      dates: s.dates,
    })),
  };

  // Cache for 6 hours
  horoscopeCache.set(cacheKey, finalHoroscope);
  if (horoscopeCache.size > 200) {
    const firstKey = horoscopeCache.keys().next().value;
    horoscopeCache.delete(firstKey);
  }

  return finalHoroscope;
}

function getAllSigns() {
  return ZODIAC_SIGNS;
}

module.exports = {
  getDailyHoroscope,
  getAllSigns,
  findSign,
};
