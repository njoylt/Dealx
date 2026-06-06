require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');

const RENDER_URL = process.env.RENDER_API_URL || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';

const MARKET_PRICES = {
  'iphone 15': 900, 'iphone 14': 700, 'iphone 13': 500, 'iphone 12': 350, 'iphone 11': 250,
  'samsung galaxy s24': 850, 'samsung galaxy s23': 600, 'samsung galaxy s22': 400,
  'samsung galaxy a54': 300, 'samsung galaxy a34': 220,
  'macbook pro': 1800, 'macbook air': 1100,
  'ps5': 500, 'playstation 5': 500, 'xbox': 450,
  'airpods pro': 250, 'airpods': 130, 'ipad pro': 900, 'ipad air': 600, 'ipad': 400,
  'bmw 3': 15000, 'bmw 5': 25000, 'audi a4': 18000, 'audi a6': 28000,
  'vw golf': 12000, 'vw passat': 15000, 'toyota corolla': 14000,
  'honda civic': 13000, 'mercedes c': 22000, 'skoda octavia': 13000,
  'nike air max': 120, 'nike dunk': 110, 'nike air force': 100,
  'adidas ultraboost': 150, 'adidas stan smith': 80,
  'jordan 1': 180, 'north face': 200, 'dyson v11': 350, 'dyson v10': 280,
  'roomba': 300, 'new balance': 100, 'canon eos': 800, 'nikon': 600,
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
  if (/bmw|audi|vw|toyota|honda|mercedes|ford|opel|skoda|auto|moto/.test(t)) return 'auto';
  if (/iphone|samsung|macbook|laptop|ps5|xbox|airpods|ipad|telefon|playstation|nintendo|canon|nikon/.test(t)) return 'tech';
  if (/nike|adidas|jordan|batai|shoes|sneaker|new balance|puma|reebok/.test(t)) return 'batai';
  if (/striuke|megztin|north face|drabuz|paltu|suknele/.test(t)) return 'drabuziai';
  if (/dyson|sofa|lova|baldai|spinta|roomba/.test(t)) return 'namai';
  if (/dvira|sportas|treniruokl|fitnes|tenisas/.test(t)) return 'sportas';
  return 'kita';
}

async function analyzeWithGemini(title, price, marketPrice) {
  if (!GEMINI_KEY) return simpleScore(price, marketPrice);
  try {
    const res = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
      { contents: [{ parts: [{ text: `Įvertink skelbimą: "${title}", kaina: ${price}€, rinkos kaina: ${marketPrice || '?'}€. TIK JSON: {"score":<0-100>,"verdict":"<IŠSKIRTINIS|PUIKUS|GERAS|VIDUTINIS|PRASTAS>","reason":"<1 sakinys lt>"}` }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 100 } },
      { headers: { 'x-goog-api-key': GEMINI_KEY, 'Content-Type': 'application/json' }, timeout: 8000 }
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
  if (d >= 25) return { score: 78, verdict: 'PUIKUS', reason: `${Math.round(d)}% pigiau už rinką` };
  if (d >= 10) return { score: 65, verdict: 'GERAS', reason: 'Šiek tiek pigiau nei rinkoje' };
  if (d >= -5) return { score: 45, verdict: 'VIDUTINIS', reason: 'Rinkos kaina' };
  return { score: 25, verdict: 'PRASTAS', reason: 'Kaina aukštesnė nei rinkos' };
}

// Alio.lt - LT skelbimų portalas be Cloudflare
async function scrapeAlio() {
  console.log('[Alio] Scraping...');
  const deals = [];
  const urls = [
    'https://www.alio.lt/skelbimai/elektronika-ir-buitine-technika/',
    'https://www.alio.lt/skelbimai/transportas/',
    'https://www.alio.lt/skelbimai/drabuzia-ir-avalyne/',
  ];

  for (const url of urls) {
    try {
      await delay(1500);
      const res = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html', 'Accept-Language': 'lt-LT,lt;q=0.9',
        }, timeout: 15000,
      });
      const $ = cheerio.load(res.data);

      $('article, .offer-item, .listing-item, [class*="offer"], [class*="item"]').each((i, el) => {
        if (i >= 15) return;
        const title = $(el).find('h2, h3, .title, [class*="title"]').first().text().trim();
        const priceText = $(el).find('[class*="price"], .price').first().text().trim();
        const href = $(el).find('a').first().attr('href');
        const image = $(el).find('img').first().attr('src') || $(el).find('img').first().attr('data-src') || '';
        const price = parseFloat(priceText.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
        if (title && price > 0 && href) {
          const fullUrl = href.startsWith('http') ? href : `https://www.alio.lt${href}`;
          deals.push({ id: `alio_${i}_${Date.now()}`, title, price, url: fullUrl, image, location: 'Lietuva', source: 'alio' });
        }
      });
    } catch (e) { console.log(`[Alio] ${url} klaida:`, e.message); }
  }
  console.log(`[Alio] Rasta: ${deals.length}`);
  return deals;
}

// Autoplius.lt - auto skelbimai
async function scrapeAutoplius() {
  console.log('[Autoplius] Scraping...');
  const deals = [];
  try {
    await delay(1000);
    const res = await axios.get('https://autoplius.lt/skelbimai/naudoti-automobiliai?make_id=&model_id=&year_from=2010&price_to=20000&has_price=1&order_by=order_date&order_direction=DESC', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html', 'Accept-Language': 'lt-LT,lt;q=0.9',
      }, timeout: 15000,
    });
    const $ = cheerio.load(res.data);

    $('.announcement-item, [class*="announcement"], .car-item').each((i, el) => {
      if (i >= 20) return;
      const title = $(el).find('h3, h2, .announcement-title, [class*="title"]').first().text().trim();
      const priceText = $(el).find('[class*="price"], .price').first().text().trim();
      const href = $(el).find('a').first().attr('href');
      const image = $(el).find('img').first().attr('src') || $(el).find('img').first().attr('data-src') || '';
      const price = parseFloat(priceText.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
      if (title && price > 0 && href) {
        const fullUrl = href.startsWith('http') ? href : `https://autoplius.lt${href}`;
        deals.push({ id: `autoplius_${i}_${Date.now()}`, title, price, url: fullUrl, image, location: 'Lietuva', source: 'autoplius' });
      }
    });
  } catch (e) { console.log('[Autoplius] Klaida:', e.message); }
  console.log(`[Autoplius] Rasta: ${deals.length}`);
  return deals;
}

async function sendToRender(listings) {
  if (!RENDER_URL) { console.log('RENDER_API_URL nenustatytas!'); return; }
  try {
    const res = await axios.post(`${RENDER_URL}/api/listings/bulk`, { listings }, { timeout: 30000 });
    console.log(`Išsiųsta į Render: ${listings.length} skelbimų. Atsakas:`, res.data);
  } catch (e) { console.log('Render siuntimo klaida:', e.message); }
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== GitHub Actions scraper pradėtas ===');

  const alioDeals = await scrapeAlio();
  const autopliusDeals = await scrapeAutoplius();
  const allDeals = [...alioDeals, ...autopliusDeals];

  console.log(`Iš viso rasta: ${allDeals.length}`);

  const analyzed = [];
  for (const deal of allDeals) {
    const marketPrice = estimateMarketPrice(deal.title);
    const category = detectCategory(deal.title);
    const discountPct = marketPrice ? Math.round(((marketPrice - deal.price) / marketPrice) * 100) : 0;
    const analysis = await analyzeWithGemini(deal.title, deal.price, marketPrice);
    analyzed.push({ ...deal, market_price: marketPrice, discount_pct: discountPct, category: category || 'kita', score: analysis.score, ai_analysis: JSON.stringify(analysis) });
    await delay(150);
  }

  console.log(`Analizuota: ${analyzed.length}`);
  await sendToRender(analyzed);
  console.log('=== Baigta ===');
}

main().catch(console.error);
