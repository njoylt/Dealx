const axios = require('axios');

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent';

/**
 * Vietinė (lokali) analizė — fallback
 */
function analyzeLocally(listing) {
  const price = parseFloat(listing.price);
  const marketPrice = parseFloat(listing.market_price);

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

/**
 * Pagrindinė analizės funkcija
 */
async function analyzeListing(listing) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === 'your_gemini_api_key_here' || apiKey.trim() === '') {
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
              text: `Įvertink Vinted skelbimą: "${listing.title}". Kaina: ${listing.price}€, Rinkos kaina: ${listing.market_price || 'nežinoma'}€. Aprašymas: "${listing.description || ''}". Grąžink TIK JSON: {"score":<0-100>,"verdict":"IŠSKIRTINIS|PUIKUS|GERAS|VIDUTINIS|PRASTAS","reason":"<1 sakinys>","risk":"ŽEMAS|VIDUTINIS|AUKŠTAS"}`
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

module.exports = { analyzeListing };