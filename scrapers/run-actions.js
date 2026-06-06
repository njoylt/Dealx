require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

const RENDER_URL = process.env.RENDER_API_URL || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';

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
      { headers: { 'x-goog-api-key': GEMINI_KEY.trim(), 'Content-Type': 'application/json' }, timeout: 8000 }
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
  if (d >= 40) return { score: 92, verdict: 'IŠSKIRTINIS', reason: `${Math.round(d)}% pigiau už rinką!` };
  if (d >= 25) return { score: 78, verdict: 'PUIKUS', reason: `${Math.round(d)}% pigiau` };
  if (d >= 10) return { score: 65, verdict: 'GERAS', reason: 'Šiek tiek pigiau' };
  if (d >= -5) return { score: 45, verdict: 'VIDUTINIS', reason: 'Rinkos kaina' };
  return { score: 25, verdict: 'PRASTAS', reason: 'Per brangu' };
}

// Gauti nemokamų proxy sąrašą
async function getFreeProxies() {
  try {
    const res = await axios.get('https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt', { timeout: 10000 });
    const proxies = res.data.split('\n').filter(p => p.trim()).slice(0, 50);
    console.log(`[Proxy] Gauta ${proxies.length} proxy`);
    return proxies;
  } catch (e) {
    console.log('[Proxy] Nepavyko gauti proxy sąrašo:', e.message);
    return [];
  }
}

// Patikrinti ar proxy veikia
async function testProxy(proxy) {
  const [host, port] = proxy.split(':');
  try {
    await axios.get('http://httpbin.org/ip', {
      proxy: { host, port: parseInt(port), protocol: 'http' },
      timeout: 5000
    });
    return true;
  } catch { return false; }
}

// Fetch su proxy rotacija
async function fetchWithProxy(url, proxies) {
  // Pirma bandome tiesiogiai
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'lt-LT,lt;q=0.9',
        'Cache-Control': 'no-cache',
      },
      timeout: 10000,
    });
    console.log(`[Fetch] Tiesioginis ryšys pavyko!`);
    return res.data;
  } catch (e) {
    console.log(`[Fetch] Tiesioginis blokuotas (${e.response?.status}), bandome proxy...`);
  }

  // Bandome per proxy
  for (const proxy of proxies.slice(0, 20)) {
    const [host, port] = proxy.split(':');
    try {
      const res = await axios.get(url, {
        proxy: { host, port: parseInt(port), protocol: 'http' },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html',
          'Accept-Language': 'lt-LT,lt;q=0.9',
        },
        timeout: 8000,
      });
      console.log(`[Fetch] Proxy ${proxy} veikia!`);
      return res.data;
    } catch (e) { }
  }
  throw new Error('Visi proxy nepavyko');
}

// Vinted RSS - neblokuojamas!
async function scrapeVintedRSS() {
  console.log('[Vinted RSS] Scraping...');
  const deals = [];
  const searches = ['nike', 'iphone', 'adidas', 'samsung', 'jordan', 'macbook', 'playstation', 'airpods'];

  for (const q of searches) {
    try {
      await delay(1000);
      // Vinted RSS feed - viešas, neblokuojamas
      const url = `https://www.vinted.lt/catalog/feed.rss?search_text=${encodeURIComponent(q)}&order=newest_first`;
      const res = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RSS reader)',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        },
        timeout: 12000,
      });

      const $ = cheerio.load(res.data, { xmlMode: true });
      $('item').each((i, el) => {
        if (i >= 8) return;
        const title = $(el).find('title').text().trim();
        const link = $(el).find('link').text().trim() || $(el).find('guid').text().trim();
        const desc = $(el).find('description').text().trim();
        const imgMatch = desc.match(/<img[^>]+src=["']([^"']+)["']/i);
        const image = imgMatch ? imgMatch[1] : '';
        const priceMatch = desc.match(/(\d+[.,]\d{2}|\d+)\s*€/) || title.match(/(\d+[.,]\d{2}|\d+)\s*€/);
        const price = priceMatch ? parseFloat(priceMatch[1].replace(',', '.')) : 0;
        if (title && price > 0) {
          deals.push({ id: `vinted_rss_${q}_${i}`, title, price, url: link, image, location: 'Lietuva', source: 'vinted' });
        }
      });
      console.log(`[Vinted RSS] "${q}": rasta ${deals.filter(d => d.id.includes(q)).length}`);
    } catch (e) { console.log(`[Vinted RSS] "${q}" klaida:`, e.message); }
  }

  console.log(`[Vinted RSS] Iš viso: ${deals.length}`);
  return deals;
}

// Skelbiu su nemokamu proxy rotatorium
async function scrapeSkelbiu(proxies) {
  console.log('[Skelbiu] Scraping su proxy rotacija...');
  const deals = [];

  try {
    const html = await fetchWithProxy('https://www.skelbiu.lt/skelbimai/?cities=0&order=1&category_id=0', proxies);
    const $ = cheerio.load(html);

    $('.simpleAds, .boldAds').each((i, el) => {
      if (i >= 20) return;
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

async function sendToRender(listings) {
  if (!RENDER_URL) { console.log('RENDER_API_URL nenustatytas!'); return; }
  try {
    const res = await axios.post(`${RENDER_URL}/api/listings/bulk`, { listings }, { timeout: 30000 });
    console.log(`Išsiųsta į Render: ${listings.length}. Atsakas:`, res.data);
  } catch (e) { console.log('Render klaida:', e.message); }
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== GitHub Actions scraper pradėtas ===');

  // Gauti proxy sąrašą
  const proxies = await getFreeProxies();

  // Paralieliai scraping'uoti
  const [vintedDeals, skelbiuDeals] = await Promise.all([
    scrapeVintedRSS(),
    scrapeSkelbiu(proxies),
  ]);

  const allDeals = [...vintedDeals, ...skelbiuDeals];
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

  console.log(`Analizuota: ${analyzed.length}`);
  await sendToRender(analyzed);
  console.log('=== Baigta ===');
}

main().catch(console.error);
