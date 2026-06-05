const axios = require('axios');
const { analyzeWithGemini, estimateMarketPrice, detectCategory } = require('../ai/analyzer');
const db = require('../database/db');

const DEMO = [
  { id: 'v1', title: 'Nike Air Max 270 42', price: 45, location: 'Vilnius' },
  { id: 'v2', title: 'iPhone 13 128GB pilkas', price: 380, location: 'Kaunas' },
  { id: 'v3', title: 'Adidas Ultraboost 22 41', price: 55, location: 'Klaipėda' },
  { id: 'v4', title: 'Samsung Galaxy S22 256GB', price: 290, location: 'Vilnius' },
  { id: 'v5', title: 'Jordan 1 Retro High 43', price: 95, location: 'Šiauliai' },
  { id: 'v6', title: 'MacBook Air M1 8GB 256GB', price: 650, location: 'Vilnius' },
  { id: 'v7', title: 'PlayStation 5 su žaidimais', price: 380, location: 'Kaunas' },
  { id: 'v8', title: 'North Face striukė S', price: 65, location: 'Vilnius' },
  { id: 'v9', title: 'iPhone 12 64GB juodas', price: 220, location: 'Panevėžys' },
  { id: 'v10', title: 'Nike Dunk Low balti 40', price: 70, location: 'Vilnius' },
  { id: 'v11', title: 'AirPods Pro 2 karta', price: 130, location: 'Kaunas' },
  { id: 'v12', title: 'Adidas Stan Smith 42', price: 35, location: 'Klaipėda' },
  { id: 'v13', title: 'iPad Air 5 64GB', price: 320, location: 'Vilnius' },
  { id: 'v14', title: 'New Balance 574 42', price: 40, location: 'Kaunas' },
  { id: 'v15', title: 'Samsung Galaxy A54 128GB', price: 180, location: 'Vilnius' },
];

async function scrapeVinted() {
  console.log('[Vinted] Pradedamas scraping...');
  let total = 0;

  try {
    const res = await axios.get('https://www.vinted.lt/api/v2/catalog/items?search_text=nike&per_page=20&order=newest_first', {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Accept-Language': 'lt-LT' },
      timeout: 8000,
    });
    const items = res.data?.items || [];
    if (items.length > 0) {
      for (const item of items.slice(0, 15)) {
        const title = item.title || ''; const price = parseFloat(item.price?.amount || item.price || 0);
        if (!title || price <= 0) continue;
        await save({ id: `vinted_${item.id}`, title, price, url: `https://www.vinted.lt/items/${item.id}`, image: item.photos?.[0]?.url || '', location: item.user?.city || 'Lietuva' });
        total++;
      }
      console.log(`[Vinted] Realus API. Įrašyta: ${total}`);
      return total;
    }
  } catch (e) { console.log('[Vinted] Demo režimas:', e.message); }

  for (const item of DEMO) {
    await save({ id: `vinted_demo_${item.id}`, title: item.title, price: item.price, url: 'https://www.vinted.lt/', image: '', location: item.location });
    total++;
  }
  console.log(`[Vinted] Demo. Įrašyta: ${total}`);
  return total;
}

async function save({ id, title, price, url, image, location }) {
  const marketPrice = estimateMarketPrice(title);
  const category = detectCategory(title) || 'kita';
  const discountPct = marketPrice ? Math.round(((marketPrice - price) / marketPrice) * 100) : 0;
  const listingData = { external_id: id, title, price, market_price: marketPrice, discount_pct: discountPct, category, source: 'vinted', url, image_url: image, description: '', location };
  const analysis = await analyzeWithGemini(listingData);
  listingData.score = analysis.score;
  listingData.ai_analysis = JSON.stringify(analysis);
  await new Promise((res) => db.upsertListing(listingData, res));
}

module.exports = { scrapeVinted };
