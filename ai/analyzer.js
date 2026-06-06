require('dotenv').config();
const axios = require('axios');


// Prieš tai buvo: const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
// Geriausi rinkos kainos šablonai analizavimui
const MARKET_PRICES = {
  'iphone 15': 900, 'iphone 14': 700, 'iphone 13': 500, 'iphone 12': 350,
  'samsung galaxy s24': 850, 'samsung galaxy s23': 600, 'samsung galaxy s22': 400,
  'macbook pro': 1800, 'macbook air': 1100,
  'ps5': 500, 'playstation 5': 500, 'xbox series x': 450,
  'airpods pro': 250, 'airpods': 130, 'ipad': 400,
  'bmw 3': 15000, 'vw golf': 12000, 'toyota corolla': 14000,
  'audi a4': 18000, 'skoda octavia': 13000,
  'nike air max': 120, 'nike dunk': 110, 'adidas ultraboost': 150,
  'jordan 1': 180, 'north face': 200, 'dyson v11': 350,
};

function estimateMarketPrice(title) {
  const t = title.toLowerCase();
  for (const [k, v] of Object.entries(MARKET_PRICES)) {
    if (t.includes(k)) return Math.round(v * (0.9 + Math.random() * 0.2));
  }
  return null;
}

function detectCategory(title) {
  const t = title.toLowerCase();
  if (/bmw|audi|vw|toyota|honda|mercedes|skoda|auto/.test(t)) return 'auto';
  if (/iphone|samsung|macbook|ps5|xbox|airpods|ipad|telefon/.test(t)) return 'tech';
  if (/nike|adidas|jordan|batai|sneaker|new balance/.test(t)) return 'batai';
  if (/striuke|megztinis|north face|drabuz/.test(t)) return 'drabuziai';
  if (/dyson|sofa|baldai|spinta/.test(t)) return 'namai';
  return 'kita';
}

function analyzeLocally(listing) {
  const price = parseFloat(listing.price);
  const marketPrice = parseFloat(listing.market_price || listing.market_market_price);

  if (!marketPrice || isNaN(price) || isNaN(marketPrice)) {
    return {
      score: 50,
      verdict: "VIDUTINIS",
      reason: "Trūksta rinkos kainos duomenų tiksliam vietiniam įvertinimui.",
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
    reason = `Kaina net ${Math.round(discountPct)}% žemesnė nei rinkos vertė. Būtina tikrinti!`;
  } else if (discountPct >= 15) {
    score = 80;
    verdict = "PUIKUS";
    risk = "ŽEMAS";
    reason = `Geras pasiūlymas, kaina apie ${Math.round(discountPct)}% žemesnė už rinką.`;
  } else if (discountPct > 0) {
    score = 65;
    verdict = "GERAS";
    risk = "ŽEMAS";
    reason = `Šiek tiek pigiau nei įprastai rinkoje.`;
  } else if (discountPct < -10) {
    score = 25;
    verdict = "PRASTAS";
    risk = "ŽEMAS";
    reason = `Kaina yra pastebimai užkelta virš rinkos vidurkio.`;
  }

  return { score, verdict, reason, risk };
}

// Sukuriame funkciją, kuri eksportuojama būtent tokiu vardu, kokio reikalauja skreiperiai
async function analyzeWithGemini(listing) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === 'your_gemini_api_key_here' || apiKey.trim() === '' || apiKey.includes('tavo_gemini')) {
    return analyzeLocally(listing);
  }

  const retries = 2;

  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.post(
        `${GEMINI_URL}?key=${apiKey}`,
        {
          contents: [{
            parts: [{
              text: `Įvertink Vinted skelbimą: "${listing.title}". Kaina: ${listing.price}€, Rinkos kaina: ${listing.market_price || 'nežinoma'}€. Aprašymas: "${listing.description || ''}". Grąžink TIK JSON formatu lietuviškai: {"score":<0-100>,"verdict":"IŠSKIRTINIS|PUIKUS|GERAS|VIDUTINIS|PRASTAS","reason":"<1 sakinys>","risk":"ŽEMAS|VIDUTINIS|AUKŠTAS"}`
            }]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 200
          }
        },
        { timeout: 7000 }
      );

      let text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      text = text.replace(/^```json/i, '').replace(/```$/, '').trim();

      const parsed = JSON.parse(text);

      if (parsed.score !== undefined && parsed.verdict) {
        return parsed;
      }
      throw new Error("Nepilnas JSON atsakas");

    } catch (err) {
      const status = err.response?.status;
      if (status === 429 || status === 503) {
        console.warn(`[AI Analyzer] Gemini limitas (${status}). Bandymas ${i + 1}/${retries}`);
        await new Promise(r => setTimeout(r, 3000 * (i + 1)));
        continue;
      }
      console.error(`[AI Analyzer] Gemini klaida:`, err.message);
      break;
    }
  }

  console.log(`[AI Analyzer] Naudojama vietinė analizė skelbimui: "${listing.title}"`);
  return analyzeLocally(listing);
}

// BŪTINA EKSPORTUOTI VISAS SKREIPERIAMS REIKALINGAS FUNKCIJAS!
module.exports = {
  analyzeWithGemini,
  analyzeListing: analyzeWithGemini, // palaikymui senos integracijos
  estimateMarketPrice,
  detectCategory
};