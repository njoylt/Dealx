require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');

const RENDER_URL = process.env.RENDER_API_URL || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const SCRAPINGBEE_KEY = process.env.SCRAPINGBEE_API_KEY || '';

const MARKET_PRICES = {
  'iphone 15': 900, 'iphone 14': 700, 'iphone 13': 500, 'iphone 12': 350, 'iphone 11': 250,
  'samsung galaxy s24': 850, 'samsung galaxy s23': 600, 'samsung galaxy s22': 400,
  'samsung galaxy a54': 300, 'macbook pro': 1800, 'macbook air': 1100,
  'ps5': 500, 'playstation 5': 500, 'xbox': 450,
  'airpods pro': 250, 'airpods': 130, 'ipad pro': 900, 'ipad air': 600, 'ipad': 400,
  'bmw 3': 15000, 'bmw 5': 25000, 'audi a4': 18000, 'vw golf': 12000,
  'toyota corolla': 14000, 'skoda octavia': 13000, 'mercedes c': 22000,
  'nike air max': 120, 'nike dunk': 110, 'adidas ultraboost': 150,
  'jordan 1': 180, 'north face': 200, 'dyson v11': 350, 'new balance': 100,
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
  if (/bmw|audi|vw|toyota|honda|mercedes|ford|skoda|auto|moto/.test(t)) return 'auto';
  if (/iphone|samsung|macbook|ps5|xbox|airpods|ipad|telefon|playstation/.test(t)) return 'tech';
  if (/nike|adidas|jordan|batai|sneaker|new balance|puma/.test(t)) return 'batai';
  if (/striuke|megztin|north face|drabuz|paltu/.test(t)) return 'drabuziai';
  if (/dyson|sofa|baldai|spinta|roomba/.test(t)) return 'namai';
  return 'kita';
}

async function analyzeWithGemini(title, price, marketPrice) {
  if (!GEMINI_KEY) return simpleScore(price, marketPrice);
  try {
    const res = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
      { contents: [{ parts: [{ text: `Įvertink skelbimą: "${title}", kaina: ${price}€, rinkos kaina: ${marketPrice || '?'}€. TIK JSON: {"score":<0-100>,"verdict":"<IŠSKIRTINIS|PUIKUS|GERAS|VIDUTINIS|PRASTAS>","reason":"<1 sakinys lt>"}` }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 100 } },
      { headers: { 'x-goog-api-key': GEMINI_KEY.trim(), 'Content-Type': 'application/json' }, timeout: 10000 }
    );
    const text = res.data.candidates[0].content.parts[0].text;
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch (e) { console.log('Gemini klaida:', e.message); }
  return simpleScore(price, marketPrice);
}

function simpleScore(price, marketPrice) {
  if (!marketPrice) return { score: 50, verdict: 'VIDUTINIS', reason: 'Nėra rinkos kainos' };
  const d = ((marketPrice - price) / marketPrice) * 100;
  if (d >= 40) return { score: 92, verdict: 'IŠSKIRTINIS', reason: `${Math.round(d)}% pigiau!` };
  if (d >= 25) return { score: 78, verdict: 'PUIKUS', reason: `${Math.round(d)}% pigiau` };
  if (d >= 10) return { score: 65, verdict: 'GERAS', reason: 'Šiek tiek pigiau' };
  if (d >= -5) return { score: 45, verdict: 'VIDUTINIS', reason: 'Rinkos kaina' };
  return { score: 25, verdict: 'PRASTAS', reason: 'Per brangu' };
}

async function fetchWithScrapingBee(url, renderJs = false) {
  if (!SCRAPINGBEE_KEY) throw new Error('SCRAPINGBEE_API_KEY nenustatytas');
  const apiUrl = `https://app.scrapingbee.com/api/v1/?api_key=${SCRAPINGBEE_KEY}&url=${encodeURIComponent(url)}&render_js=${renderJs}&premium_proxy=true`;
  const res = await axios.get(apiUrl, { timeout: 30000 });
  return res.data;
}

async function scrapeSkelbiu() {
  console.log('[Skelbiu] Scraping su ScrapingBee...');
  const deals = [];
  try {
    const html = await fetchWithScrapingBee('https://www.skelbiu.lt/skelbimai/?cities=0&order=1&category_id=0', true);
    const $ = cheerio.load(html);
    $('.simpleAds, .boldAds').each((i, el) => {
      if (i >= 25) return;
      const id = $(el).attr('id')?.replace('id-', '');
      const title = $(el).find('.adsTitle h3 a').text().trim();
      const priceText = $(el).find('.adsPrice').text().trim();
      const href = $(el).find('.adsTitle h3 a').attr('href');
      const image = $(el).find('.adsImage img').attr('src') || '';
      const location = $(el).find('.adsDetails').text().trim().split(';')?.[0] || 'Lietuva';
      const price = parseFloat(priceText.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
      if (id && title && price > 0 && href) {
        deals.push({ id: `skelbiu_${id}`, title, price, url: `https://www.skelbiu.lt${href}`, image, location, source: 'skelbiu' });
      }
    });
    console.log(`[Skelbiu] Rasta: ${deals.length}`);
  } catch (e) { console.log('[Skelbiu] Klaida:', e.message); }
  return deals;
}

async function scrapeVinted() {
  console.log('[Vinted] Scraping su ScrapingBee...');
  const deals = [];
  const searches = ['nike', 'iphone', 'adidas', 'samsung', 'jordan', 'macbook'];

  for (const q of searches) {
    try {
      await delay(1000);
      // Pirma gauti sesijos cookie
      const mainPage = await fetchWithScrapingBee('https://www.vinted.lt', true);
      
      // Tada API užklausa
      const apiUrl = `https://www.vinted.lt/api/v2/catalog/items?search_text=${encodeURIComponent(q)}&per_page=10&order=newest_first`;
      const html = await fetchWithScrapingBee(apiUrl, false);
      
      let data;
      try { data = typeof html === 'string' ? JSON.parse(html) : html; } catch { continue; }
      
      const items = data?.items || [];
      for (const item of items.slice(0, 5)) {
        const price = parseFloat(item.price?.amount || item.price || 0);
        if (item.title && price > 0) {
          deals.push({ id: `vinted_${item.id}`, title: item.title, price, url: `https://www.vinted.lt/items/${item.id}`, image: item.photos?.[0]?.url || '', location: 'Lietuva', source: 'vinted' });
        }
      }
      console.log(`[Vinted] "${q}": ${items.length} items`);
    } catch (e) { console.log(`[Vinted] "${q}" klaida:`, e.message); }
  }
  console.log(`[Vinted] Iš viso: ${deals.length}`);
  return deals;
}

async function sendToRender(listings) {
  if (!RENDER_URL) { console.log('RENDER_API_URL nenustatytas!'); return; }
  try {
    const res = await axios.post(`${RENDER_URL}/api/listings/bulk`, { listings }, { timeout: 30000 });
    console.log(`Išsiųsta: ${listings.length}. Atsakas:`, res.data);
  } catch (e) { console.log('Render klaida:', e.message); }
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== GitHub Actions scraper pradėtas ===');
  
  if (!SCRAPINGBEE_KEY) {
    console.log('❌ SCRAPINGBEE_API_KEY nerasta! Pridėk GitHub Secrets.');
    return;
  }
  console.log('✅ ScrapingBee key rastas');

  const [skelbiuDeals, vintedDeals] = await Promise.all([
    scrapeSkelbiu(),
    scrapeVinted(),
  ]);

  const allDeals = [...skelbiuDeals, ...vintedDeals];
  console.log(`Iš viso rasta: ${allDeals.length}`);

  const analyzed = [];
  for (const deal of allDeals) {
    const marketPrice = estimateMarketPrice(deal.title);
    const category = detectCategory(deal.title);
    const discountPct = marketPrice ? Math.round(((marketPrice - deal.price) / marketPrice) * 100) : 0;
    const analysis = await analyzeWithGemini(deal.title, deal.price, marketPrice);
    analyzed.push({ ...deal, market_price: marketPrice, discount_pct: discountPct, category: category || 'kita', score: analysis.score, ai_analysis: JSON.stringify(analysis) });
    await delay(100);
  }

  await sendToRender(analyzed);
  console.log('=== Baigta ===');
}

main().catch(console.error);
