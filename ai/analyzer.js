const axios = require('axios');

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';

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
    if (t.includes(k)) {
      return Math.round(v * (0.9 + Math.random() * 0.2));
    }
  }
  return null;
}

function detectCategory(title) {
  const t = title.toLowerCase();
  if (/bmw|audi|vw|toyota|honda|mercedes|skoda|auto|dacia|ford/.test(t)) return 'auto';
  if (/iphone|samsung|macbook|ps5|xbox|airpods|ipad|telefon|nokia/.test(t)) return 'tech';
  if (/nike|adidas|jordan|batai|sneaker|new balance|puma|reebok/.test(t)) return 'batai';
  if (/striuke|megztin|north face|drabuz|marsk|kelnes|kepure/.test(t)) return 'drabuziai';
  if (/dyson|sofa|baldai|spinta|stalas|kede|lentyna|lovele/.test(t)) return 'namai';
  if (/futbol|kamuol|rakete|begimo|treniruote|sporto/.test(t)) return 'sportas';
  return 'kita';
}

function simpleScore(price, marketPrice) {
  if (!marketPrice) {
    return { score: 50, verdict: 'VIDUTINIS', reason: 'Nera rinkos kainos' };
  }
  
  const d = ((marketPrice - price) / marketPrice) * 100;
  
  if (d >= 40) {
    return { score: 90, verdict: 'ISZKIRTINIS', reason: Math.round(d) + '% pigiau!' };
  }
  if (d >= 25) {
    return { score: 78, verdict: 'PUIKUS', reason: Math.round(d) + '% pigiau' };
  }
  if (d >= 10) {
    return { score: 65, verdict: 'GERAS', reason: 'Siek tiek pigiau' };
  }
  if (d >= 0) {
    return { score: 45, verdict: 'VIDUTINIS', reason: 'Rinkos kaina' };
  }
  
  return { score: 30, verdict: 'BRANGESNIS', reason: 'Brangesnis nei rinka' };
}

async function analyzeWithGemini(listing) {
  if (!GEMINI_KEY) {
    return simpleScore(listing.price, listing.market_price);
  }

  try {
    const prompt = 'Ivertink sj prekybos skelbima (tik JSON atsakymas): Pavadinimas: ' + listing.title + ' Kaina: ' + listing.price + ' Rinkos kaina: ' + (listing.market_price || '?') + ' Kategorija: ' + (listing.category || 'kita') + ' Grazink JSON: {"score": <0-100>, "verdict": "<ISZKIRTINIS|PUIKUS|GERAS|VIDUTINIS|BRANGESNIS>", "reason": "<trumpa>"}' ;

    const res = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + GEMINI_KEY,
      {
        contents: [{
          parts: [{ text: prompt }]
        }]
      },
      { timeout: 8000 }
    );

    const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (typeof parsed.score === 'number' && parsed.verdict && parsed.reason) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('[Gemini] Klaida:', err.message);
  }

  return simpleScore(listing.price, listing.market_price);
}

module.exports = {
  analyzeWithGemini,
  estimateMarketPrice,
  detectCategory,
  simpleScore
};
