const axios = require('axios');

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

/**
 * Vietinė (lokali) analizė, kuri naudojama kaip atsarginis variantas (Fallback).
 * Visiškai nemokama, neribojama ir veikia akimirksniu.
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

  // Skaičiuojam nuolaidą procentais
  const discountPct = ((marketPrice - price) / marketPrice) * 100;

  let score = 50;
  let verdict = "VIDUTINIS";
  let risk = "VIDUTINIS";
  let reason = `Kaina (${price}€) yra arti rinkos vidurkio (${marketPrice}€).`;

  if (discountPct >= 35) {
    score = 95;
    verdict = "IŠSKIRTINIS";
    risk = "AUKŠTAS"; // Didelė nuolaida dažnai slepia defektus arba scamus
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
 * Pagrindinė analizės funkcija, sujungianti Gemini ir vietinę logiką.
 */
async function analyzeListing(listing) {
  const apiKey = process.env.GEMINI_API_KEY;
  
  // Jei API raktas neįvestas, iškart naudojam vietinį algoritmą
  if (!apiKey || apiKey === 'your_gemini_api_key_here' || apiKey.trim() === '') {
    return analyzeLocally(listing);
  }

  const retries = 2; // Sumažinam iki 2 bandymų, kad taupytume laiką, jei limitas pasiektas
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.post(
        `${GEMINI_URL}?key=${apiKey}`,
        {
          contents: [{
            parts: [{
              text: `Įvertink Vinted skelbimą: "${listing.title}". Kaina: ${listing.price}€, Rinkos kaina: ${listing.market_price || 'nežinoma'}€. Aprašymas: "${listing.description || ''}". Grąžink griežtai TIK JSON formatu (be jokių markdown blokų): {"score":50,"verdict":"VIDUTINIS","reason":"paaiškinimas lietuviškai","risk":"ŽEMAS"}`
            }]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 200
          }
        },
        { timeout: 6000 }
      );

      let text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      text = text.trim();
      
      // Saugus išvalymas be regex, kuris sukėlė SyntaxError pastarajame deploje
      if (text.startsWith('```')) {
        const lines = text.split('\n');
        // Pašalinam pirmą ir paskutinę eilutę, jei jos turi backticks
        if (lines[0].includes('```')) lines.shift();
        if (lines[lines.length - 1].includes('```')) lines.pop();
        text = lines.join('\n').trim();
      }

      // Bandome atpažinti JSON. Jei tekstas nukirstas (Unterminated string), suveiks catch blokas
      const parsedJson = JSON.parse(text);
      
      if (parsedJson && parsedJson.score !== undefined) {
        return parsedJson;
      }
      
      throw new Error("Nepilnas JSON iš AI");

    } catch (err) {
      const status = err.response?.status;
      
      if (status === 429 || status === 503) {
        console.warn(`[AI Analyzer] Gemini limitas/apkrova (${status}). Bandymas ${i + 1}/${retries}.`);
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 3000)); // palaukiam 3s prieš sekantį bandymą
          continue;
        }
      } else {
        console.error(`[AI Analyzer] Gemini JSON parsinimo arba kita klaida:`, err.message);
        break; // Jei JSON formatas sugadintas, iškart sokam į lokalų vertinimą
      }
    }
  }

  // Saugiklis: jeigu Gemini meta 429, 503 arba sugeneruoja nesąmoningą JSON – grąžiname vietinį rezultatą
  return analyzeLocally(listing);
}

module.exports = {
  analyzeListing
};
