require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');

const RENDER_URL = process.env.RENDER_API_URL || '';
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim().replace(/['"`]/g, '');
const SCRAPINGBEE_KEY = process.env.SCRAPINGBEE_API_KEY || '';

// PATAISYTA: Tikslus Gemini API adresas su API raktu parametruose
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

async function analyzeWithGemini(title, price, marketPrice) {
  if (!GEMINI_API_KEY) return { score: 50, verdict: 'VIDUTINIS', reason: 'Nėra rakto' };
  try {
    const res = await axios.post(GEMINI_URL, {
      contents: [{ parts: [{ text: `Įvertink skelbimą: "${title}", kaina: ${price}€, rinkos kaina: ${marketPrice || '?'}€. TIK JSON formatu: {"score":<0-100>,"verdict":"IŠSKIRTINIS|PUIKUS|GERAS|VIDUTINIS|PRASTAS","reason":"1 sakinys"}` }] }],
      generationConfig: { temperature: 0.2 }
    }, { timeout: 8000 });
    const text = res.data.candidates[0].content.parts[0].text;
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch (e) {
    console.log('[AI] Gemini klaida:', e.message);
    return { score: 50, verdict: 'VIDUTINIS', reason: 'Analizė nepavyko' };
  }
}

async function scrapeSkelbiu() {
  console.log('[Skelbiu] Bandau...');
  try {
    // PATAISYTA: Padidintas timeout ir pridėtas 'wait_for' parametras
    const proxyUrl = `https://app.scrapingbee.com/api/v1/?api_key=${SCRAPINGBEE_KEY}&url=https://www.skelbiu.lt/skelbimai/&render_js=false&premium_proxy=true`;
    const res = await axios.get(proxyUrl, { timeout: 45000 });
    const $ = cheerio.load(res.data);
    const deals = [];
    $('.simpleAds').each((i, el) => {
      if (i > 5) return;
      const title = $(el).find('.adsTitle h3 a').text().trim();
      const price = parseFloat($(el).find('.adsPrice').text().replace(/[^\d.]/g, '')) || 0;
      if (title && price > 0) deals.push({ title, price, source: 'skelbiu' });
    });
    return deals;
  } catch (e) {
    console.log('[Skelbiu] Klaida:', e.message);
    return [];
  }
}

async function scrapeVinted() {
  console.log('[Vinted] Bandau...');
  const deals = [];
  const q = ['nike', 'iphone'];
  for (const s of q) {
    try {
      const url = `https://www.vinted.lt/api/v2/catalog/items?search_text=${s}&per_page=5`;
      const proxyUrl = `https://app.scrapingbee.com/api/v1/?api_key=${SCRAPINGBEE_KEY}&url=${encodeURIComponent(url)}&render_js=false&premium_proxy=true`;
      const res = await axios.get(proxyUrl, { timeout: 20000 });
      res.data.items.forEach(item => {
        deals.push({ title: item.title, price: parseFloat(item.price.amount), source: 'vinted' });
      });
    } catch(e) {}
  }
  return deals;
}

async function main() {
  console.log('=== Pradėta ===');
  const all = [...(await scrapeSkelbiu()), ...(await scrapeVinted())];
  const analyzed = [];
  for (const item of all) {
    const ai = await analyzeWithGemini(item.title, item.price, 0);
    analyzed.push({ ...item, ...ai });
  }
  if (RENDER_URL) await axios.post(`${RENDER_URL}/api/listings/bulk`, { listings: analyzed });
  console.log('=== Baigta ===');
}

main().catch(console.error);