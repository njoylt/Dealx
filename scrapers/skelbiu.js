const axios = require('axios');
const cheerio = require('cheerio');
const { analyzeWithGemini, estimateMarketPrice, detectCategory } = require('../ai/analyzer');
const db = require('../database/db');

const DEMO = [
  { id: 's1', title: 'iPhone 13 128GB juodas', price: 320, location: 'Vilnius' },
  { id: 's2', title: 'VW Golf 7 2015m 1.6 TDI', price: 9500, location: 'Kaunas' },
  { id: 's3', title: 'MacBook Air M1 256GB', price: 620, location: 'Vilnius' },
  { id: 's4', title: 'Samsung Galaxy S23 256GB', price: 420, location: 'Klaipėda' },
  { id: 's5', title: 'BMW 320d 2018m automatinis', price: 19500, location: 'Vilnius' },
  { id: 's6', title: 'PS5 su 3 žaidimais', price: 350, location: 'Kaunas' },
  { id: 's7', title: 'Dyson V11 dulkių siurblys', price: 180, location: 'Vilnius' },
  { id: 's8', title: 'Audi A4 2017m 2.0 TDI', price: 16500, location: 'Šiauliai' },
  { id: 's9', title: 'iPad Air 5 64GB WiFi', price: 280, location: 'Vilnius' },
  { id: 's10', title: 'Toyota Corolla 2019m hibrid', price: 18000, location: 'Kaunas' },
  { id: 's11', title: 'iPhone 12 64GB baltas', price: 210, location: 'Panevėžys' },
  { id: 's12', title: 'Skoda Octavia 2016m 2.0 TDI', price: 11500, location: 'Vilnius' },
];

async function fetchUrl(url) {
  const scrapingBeeKey = process.env.SCRAPINGBEE_API_KEY;

  // Jei yra ScrapingBee key — naudojam proxy
  if (scrapingBeeKey) {
    const proxyUrl = `https://app.scrapingbee.com/api/v1/?api_key=${scrapingBeeKey}&url=${encodeURIComponent(url)}&render_js=false`;
    const res = await axios.get(proxyUrl, { timeout: 20000 });
    return res.data;
  }

  // Be proxy — tiesiogiai (gali blokuoti)
  const res = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html',
      'Accept-Language': 'lt-LT,lt;q=0.9',
    },
    timeout: 10000,
  });
  return res.data;
}

async function scrapeSkelbiu() {
  console.log('[Skelbiu] Pradedamas scraping...');
  let total = 0;

  try {
    const html = await fetchUrl('https://www.skelbiu.lt/skelbimai/?cities=0&order=1&category_id=0');
    const $ = cheerio.load(html);
    const items = [];

    $('.simpleAds, .boldAds').each((index, element) => {
      if (index >= 15) return;
      const id = $(element).attr('id')?.replace('id-', '');
      const title = $(element).find('.adsTitle h3 a').text().trim();
      const priceText = $(element).find('.adsPrice').text().trim();
      const href = $(element).find('.adsTitle h3 a').attr('href');
      const url = href ? 'https://www.skelbiu.lt' + href : 'https://www.skelbiu.lt/';
      const image = $(element).find('.adsImage img').attr('src') || '';
      const location = $(element).find('.adsDetails').text().trim().split(';')?.[0] || 'Lietuva';
      const price = parseFloat(priceText.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
      if (id && title && price > 0) items.push({ id, title, price, url, image, location });
    });

    if (items.length > 0) {
      for (const item of items) {
        await save({ id: `skelbiu_${item.id}`, ...item });
        total++;
      }
      console.log(`[Skelbiu] HTML sėkmingai. Įrašyta: ${total}`);
      return total;
    }
    console.log('[Skelbiu] HTML gautas bet skelbimų nerasta — demo');
  } catch (e) {
    console.log('[Skelbiu] Klaida:', e.message, '— demo');
  }

  for (const item of DEMO) {
    await save({ id: `skelbiu_demo_${item.id}`, title: item.title, price: item.price, url: 'https://www.skelbiu.lt/', image: '', location: item.location });
    total++;
  }
  console.log(`[Skelbiu] Demo. Įrašyta: ${total}`);
  return total;
}

async function save({ id, title, price, url, image, location }) {
  const marketPrice = estimateMarketPrice(title);
  const category = detectCategory(title) || 'kita';
  const discountPct = marketPrice ? Math.round(((marketPrice - price) / marketPrice) * 100) : 0;
  const listingData = { external_id: id, title, price, market_price: marketPrice, discount_pct: discountPct, category, source: 'skelbiu', url, image_url: image, description: '', location };
  try {
    const analysis = await analyzeWithGemini(listingData);
    listingData.score = analysis.score;
    listingData.ai_analysis = JSON.stringify(analysis);
  } catch {
    listingData.score = 50;
    listingData.ai_analysis = JSON.stringify({ score: 50, verdict: 'VIDUTINIS', reason: 'AI klaida' });
  }
  await new Promise((res) => db.upsertListing(listingData, res));
}

module.exports = { scrapeSkelbiu };
