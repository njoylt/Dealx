const axios = require('axios');

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

const MARKET_PRICES = {
  'iphone 15': 900, 'iphone 14': 700, 'iphone 13': 500, 'iphone 12': 350, 'iphone 11': 250,
  'samsung galaxy s24': 850, 'samsung galaxy s23': 600, 'samsung galaxy s22': 400,
  'samsung galaxy a54': 300, 'samsung galaxy a34': 220,
  'macbook pro': 1800, 'macbook air': 1100,
  'ps5': 500, 'playstation 5': 500, 'xbox series x': 450,
  'airpods pro': 250, 'airpods': 130,
  'ipad pro': 900, 'ipad air': 600, 'ipad': 400,
  'bmw 3': 15000, 'bmw 5': 25000, 'audi a4': 18000, 'audi a6': 28000,
  'vw golf': 12000, 'vw passat': 15000, 'toyota corolla': 14000,
  'honda civic': 13000, 'mercedes c': 22000, 'skoda octavia': 13000,
  'nike air max': 120, 'nike dunk': 110, 'nike air force': 100,
  'adidas ultraboost': 150, 'adidas stan smith': 80,
  'jordan 1': 180, 'jordan': 150,
  'north face': 200, 'dyson v15': 500, 'dyson v11': 350,
  'roomba': 300, 'new balance': 100,
};

function estimateMarketPrice(title) {
  const t = title.toLowerCase();
  for (const [keyword, price] of Object.entries(MARKET_PRICES)) {
    if (t.includes(keyword)) return Math.round(price * (0.9 + Math.random() * 0.2));
  }
  return null;
}

function detectCategory(title) {
  const t = title.toLowerCase();
  if (/bmw|audi|vw|toyota|honda|mercedes|ford|opel|auto|moto|skoda/.test(t)) return 'auto';
  if (/iphone|samsung|macbook|laptop|ps5|xbox|airpods|ipad|telefon|playstation/.test(t)) return 'tech';
  if (/nike|adidas|jordan|batai|shoes|sneaker|new balance|puma/.test(t)) return 'batai';
  if (/drabuz|shirt|jacket|coat|striuke|megztin|north face/.test(t)) return 'drabuziai';
  if (/sofa|lova|baldai|spinta|dyson|roomba/.test(t)) return 'namai';
  if (/dvira|sportas|treniruokl|fitnes|tenisas|futbol/.test(t)) return 'sportas';
  return 'kita';
}

async function analyzeWithGemini(listing) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') return analyzeLocally(listing);

  try {
    const response = await axios.post(
      `${GEMINI_URL}?key=${apiKey}`,
      {
        contents: [{ parts: [{ text: `Įvertink skelbimą: "${listing.title}", kaina: ${listing.price}€, rinkos kaina: ${listing.market_price || '?'}€. Grąžink TIK JSON: {"score":<0-100>,"verdict":"<IŠSKIRTINIS|PUIKUS|GERAS|VIDUTINIS|PRASTAS>","reason":"<1 sakinys lt>","risk":"<ŽEMAS|VIDUTINIS|AUKŠTAS>"}` }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 150 }
      },
      { timeout: 8000 }
    );
    const text = response.data.candidates[0].content.parts[0].text;
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch (err) {
    console.error('Gemini klaida:', err.message);
  }
  return analyzeLocally(listing);
}

function analyzeLocally(listing) {
  const mp = listing.market_price;
  let score = 50, verdict = 'VIDUTINIS', reason = 'Standartinė rinkos kaina.';
  if (mp && listing.price) {
    const d = ((mp - listing.price) / mp) * 100;
    if (d >= 40) { score = 88 + Math.random()*12; verdict = 'IŠSKIRTINIS'; reason = `Kaina ${Math.round(d)}% žemiau rinkos!`; }
    else if (d >= 25) { score = 75 + Math.random()*13; verdict = 'PUIKUS'; reason = `Kaina ${Math.round(d)}% žemiau rinkos.`; }
    else if (d >= 10) { score = 60 + Math.random()*15; verdict = 'GERAS'; reason = `Šiek tiek pigiau.`; }
    else if (d >= -5) { score = 40 + Math.random()*20; verdict = 'VIDUTINIS'; reason = `Atitinka rinkos kainą.`; }
    else { score = 15 + Math.random()*25; verdict = 'PRASTAS'; reason = `Kaina per aukšta.`; }
  }
  return { score: Math.round(score), verdict, reason, risk: score > 70 ? 'ŽEMAS' : score > 40 ? 'VIDUTINIS' : 'AUKŠTAS' };
}

module.exports = { analyzeWithGemini, estimateMarketPrice, detectCategory };
