const axios = require('axios');

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

/**
 * Paprastas rinkos kainų žemėlapis
 */
const MARKET_PRICES = {
  'iphone 15': 900,
  'iphone 14': 700,
  'iphone 13': 500,
  'iphone 12': 350,
  'samsung galaxy s24': 850,
  'samsung galaxy s23': 600,
  'samsung galaxy s22': 400,
  'macbook pro': 1800,
  'macbook air': 1100,
  'ps5': 500,
  'playstation 5': 500,
  'xbox series x': 450,
  'airpods pro': 250,
  'airpods': 130,
  'ipad': 400,
  'bmw 3': 15000,
  'vw golf': 12000,
  'toyota corolla': 14000,
  'audi a4': 18000,
  'skoda octavia': 13000,
  'nike air max': 120,
  'nike dunk': 110,
  'adidas ultraboost': 150,
  'jordan 1': 180,
  'north face': 200,
  'dyson v11': 350,
};

/**
 * Rinkos kainos įvertinimas
 */
function estimateMarketPrice(title) {
  const t = (title || '').toLowerCase();
  for (const [k, v] of Object.entries(MARKET_PRICES)) {
    if (t.includes(k)) {
      return Math.round(v * (0.9 + Math.random() * 0.2));
    }
  }
  return null;
}

/**
 * Kategorijos nustatymas
 */
function detectCategory(title) {
  const t = (title || '').toLowerCase();

  if (/bmw|audi|vw|toyota|honda|mercedes|skoda|auto/.test(t)) return 'auto';
  if (/iphone|samsung|macbook|ps5|xbox|airpods|ipad|telefon/.test(t)) return 'tech';
  if (/nike|adidas|jordan|batai|sneaker|new balance/.test(t)) return 'batai';
  if (/striuke|megztin|north face|drabuz/.test(t)) return 'drabuziai';
  if (/dyson|sofa|baldai|spinta/.test(t)) return 'namai';

  return 'kita';
}

/**
 * Vietinė analizė
 */
function analyzeLocally(listing) {
  const price = parseFloat(listing.price);
  const marketPrice = parseFloat(listing.market_price);

  if (!marketPrice || isNaN(price) || isNaN(marketPrice)) {
    return {
      score: 50,
      verdict: "VIDUTINIS",
      reason: "Trūksta rinkos kainos duomenų.",
      risk: "VIDUTINIS"
    };
  }

  const discountPct = ((marketPrice - price) / marketPrice) * 100;

  let score = 50;
  let verdict = "VIDUTINIS";
  let risk = "VIDUTINIS";
  let reason = `Kaina (${price}€) yra arti rinkos vidurkio (${marketPrice}€).`;

  if (discountPct >= 35) {
    score = 95;
    verdict = "IŠSKIRTINIS";
    risk = "AUKŠTAS";
    reason = `Kaina net ${Math.round(discountPct)}% žemesnė nei rinkos vertė.`;
  } else if (discountPct >= 15) {
    score = 80;
    verdict = "PUIKUS";
    risk = "ŽEMAS";
    reason = `Geras pasiūlymas (${Math.round(discountPct)}% žemiau rinkos).`;
  } else if (discountPct > 0) {
    score = 65;
    verdict = "GERAS";
    risk = "ŽEMAS";
    reason = `Šiek tiek pigiau nei rinkoje.`;
  } else if (discountPct < -10) {
    score = 25;
    verdict = "PRASTAS";
    risk = "ŽEMAS";
    reason = `Kaina aukštesnė nei rinkos vidurkis.`;
  }

  return { score, verdict, reason, risk };
}

/**
 * Pagrindinė analizė
 */
async function analyzeListing(listing) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return analyzeLocally(listing);

  try {
    const response = await axios.post(
      `${GEMINI_URL}?key=${apiKey}`,
      {
        contents: [{
          parts: [{
            text: `Įvertink skelbimą: "${listing.title}". Kaina: ${listing.price}€, Rinkos kaina: ${listing.market_price}. Grąžink TIK JSON: {"score":..,"verdict":"..","reason":"..","risk":".."}.`
          }]
        }],
        generationConfig: { temperature: 0.1 }
      },
      { timeout: 6000 }
    );

    let text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    text = text.replace(/^```json/i, '').replace(/```$/, '').trim();

    return JSON.parse(text);

  } catch (err) {
    return analyzeLocally(listing);
  }
}

/**
 * Suderinamumas su skreiperiais
 */
async function analyzeWithGemini(listing) {
  return analyzeListing(listing);
}

module.exports = {
  analyzeListing,
  analyzeWithGemini,
  estimateMarketPrice,
  detectCategory
};