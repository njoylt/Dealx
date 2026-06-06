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
  
  // Jei API raktas neįvestas arba paliktas defaultinis, iškart naudojam vietinį algoritmą
  if (!apiKey || apiKey === 'your_gemini_api_key_here' || apiKey.trim() === '') {
    return analyzeLocally(listing);
  }

  const retries = 3;
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.post(
        `${GEMINI_URL}?key=${apiKey}`,
        {
          contents: [{
            parts: [{
              text: `Įvertink Vinted skelbimą: "${listing.title}". Kaina: ${listing.price}€, Rinkos kaina: ${listing.market_price || 'nežinoma'}€. Aprašymas: "${listing.description || ''}". Grąžink griežtai TIK JSON formatu (be jokių markdown \`\`\` blokų): {"score":<skaičius 0-100>,"verdict":"<IŠSKIRTINIS|PUIKUS|GERAS|VIDUTINIS|PRASTAS>","reason":"<1 sakinys lietuviškai kodėl toks balas>","risk":"<ŽEMAS|VIDUTINIS|AUKŠTAS>"}`
            }]
          }],
          generationConfig: {
            temperature: 0.1, // Mažesnė temperatūra užtikrina tikslesnį JSON laikymąsi
            maxOutputTokens: 250
          }
        },
        { timeout: 8000 } // Jei per 8s neatsako, metam klaidą ir bandom vėl/jungiam fallback
      );

      // Saugiai ištraukiam tekstą
      let text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      
      // Išvalom galimus markdown apvalkalus (```json ... 
```)
      text = text.replace(/^```json\s*/i, '').replace(/```$/, '').trim();

      // Bandome pargriebti JSON. Jei tekstas nepilnas, tai išmes klaidą ir suveiks catch blokas
      const parsedJson = JSON.parse(text);
      
      // Patvirtinam, kad visi reikalingi laukai yra
      if (parsedJson.score !== undefined && parsedJson.verdict) {
        return parsedJson;
      }
      
      throw new Error("Nepilnas JSON atsakas iš AI");

    } catch (err) {
      const status = err.response?.status;
      
      // Jei gavome limitų klaidą (429) arba serveris lūžta (503)
      if (status === 429 || status === 503) {
        const waitTime = Math.pow(2, i) * 4000; // Eksponentinis laukimas: 4s, 8s...
        console.warn(`[AI Analyzer] Gemini limitas pasiektas (${status}). Bandymas ${i + 1}/${retries}. Laukiam ${waitTime}ms...`);
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
      } else {
        console.error(`[AI Analyzer] Klaida siunčiant užklausą į Gemini:`, err.message);
        // Kitų klaidų atveju (pvz. invalid API key) iškart šokam į fallback, nesikankinam su retries
        break; 
      }
    }
  }

  // Jei visi bandymai su Gemini nepavyko, aktyvuojamas nemokamas vietinis variklis
  console.log(`[AI Analyzer] Gemini nepavyko suveikti. Naudojama nemokama vietinė analizė skelbimui: "${listing.title}"`);
  return analyzeLocally(listing);
}

module.exports = {
  analyzeListing
};
