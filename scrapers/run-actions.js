// Šis failas paleidžiamas tik GitHub Actions aplinkoje
require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');

const RENDER_URL = process.env.RENDER_API_URL || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''; 

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
  if (!GEMINI_API_KEY) return simpleScore(price, marketPrice);
  try {
    const res = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
      { contents: [{ parts: [{ text: `Įvertink skelbimą: "${title}", kaina: ${price}€, rinkos kaina: ${marketPrice || '?'}€. TIK JSON: {"score":<0-100>,"verdict":"<IŠSKIRTINIS|PUIKUS|GERAS|VIDUTINIS|PRASTAS>","reason":"<1 sakinys lt>"}` }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 100 } },
      { headers: { 'x-goog-api-key': GEMINI_API_KEY.trim().replace(/['"`]/g, ''), 'Content-Type': 'application/json' }, timeout: 10000 }
    );
    const text = res.data.candidates[0].content.parts[0].text;
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch (e) { 
    console.log('[AI Analyzer] Gemini klaida:', e.message); 
  }
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

// Atsisiunčiame nemokamus HTTP proxy serverius iš GitHub šaltinio
async function getFreeProxies() {
  try {
    const res = await axios.get('https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt', { timeout: 10000 });
    const list = res.data.split('\n').filter(p => p.trim());
    console.log(`[Proxy] Sėkmingai gauta ${list.length} proxy serverių.`);
    return list;
  } catch (e) {
    console.log('[Proxy] Klaida siunčiantis proxy sąrašą:', e.message);
    return [];
  }
}

// Funkcija, kuri bando krauti URL tiesiogiai, o nepavykus – rotuoja proxy sąrašą
async function fetchWithProxy(url, proxies, sourceName = 'Svetainė') {
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'lt-LT,lt;q=0.9',
        'Cache-Control': 'no-cache'
      },
      timeout: 5000,
    });
    return res.data;
  } catch (e) {
    console.log(`[Fetch - ${sourceName}] Tiesioginis ryšys blokuotas (${e.message}), bandomi proxy serveriai...`);
  }

  // Atsitiktine tvarka paimame iki 30 proxy iš sąrašo, kad nedarytume užklausų per tuos pačius
  const shuffledProxies = proxies.sort(() => 0.5 - Math.random()).slice(0, 30);

  for (const proxy of shuffledProxies) {
    const [host, port] = proxy.split(':');
    try {
      const res = await axios.get(url, {
        proxy: { host, port: parseInt(port), protocol: 'http' },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'lt-LT,lt;q=0.9',
        },
        timeout: 6000,
      });
      console.log(`[Fetch - ${sourceName}] Proxy ${proxy} sėkmingai suveikė!`);
      return res.data;
    } catch (e) {
      // Jei proxy neveikia, tyliai bandom kitą
    }
  }
  throw new Error(`[${sourceName}] Nepavyko pasiekti puslapio nei tiesiogiai, nei per proxy rotaciją.`);
}

// Skelbiu.lt skreiperis su proxy rotacija
async function scrapeSkelbiu(proxies) {
  console.log('[Skelbiu] Skenuojama naudojant proxy rotatorių...');
  const deals = [];

  try {
    const html = await fetchWithProxy('https://www.skelbiu.lt/skelbimai/?cities=0&order=1&category_id=0', proxies, 'Skelbiu');
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
    console.log(`[Skelbiu] Sėkmingai rasta: ${deals.length} skelbimų.`);
  } catch (e) { 
    console.log('[Skelbiu] Skenavimo klaida:', e.message); 
  }
  return deals;
}

// Alio.lt skreiperis (Dabar taip pat naudoja proxy rotaciją!)
async function scrapeAlio(proxies) {
  console.log('[Alio.lt] Skenuojama naudojant proxy rotatorių...');
  const deals = [];
  try {
    const html = await fetchWithProxy('https://www.alio.lt/paieska/?category_id=0&order_by=2', proxies, 'Alio');
    const $ = cheerio.load(html);
    
    $('.advert-item, .list-item, .ad-card').each((i, el) => {
      if (i >= 15) return;
      const titleEl = $(el).find('.title a, .ad-title a, h3 a');
      const title = titleEl.text().trim();
      const href = titleEl.attr('href');
      const url = href ? (href.startsWith('http') ? href : 'https://www.alio.lt' + href) : '';
      
      const priceText = $(el).find('.price, .ad-price, .item-price').text().trim();
      const price = parseFloat(priceText.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
      
      const image = $(el).find('.image img, .img-wrapper img, img').attr('src') || '';
      const location = $(el).find('.city, .location').text().trim() || 'Lietuva';
      
      const idMatch = url.match(/ID-(\d+)/i) || url.match(/-(\d+)\.html/);
      const id = idMatch ? idMatch[1] : Math.random().toString(36).substring(7);

      if (title && price > 0 && url) {
        deals.push({
          id: `alio_${id}`,
          title: title,
          price: price,
          url: url,
          image: image,
          location: location,
          source: 'vinted' // Išlaikome 'vinted', kad nereikėtų keisti jūsų DB/Frontend logikos
        });
      }
    });
    console.log(`[Alio.lt] Sėkmingai rasta: ${deals.length} skelbimų.`);
  } catch (e) {
    console.log('[Alio.lt] Skenavimo klaida:', e.message);
  }
  return deals;
}

async function sendToRender(listings) {
  if (!RENDER_URL) { console.log('RENDER_API_URL kintamasis nerastas!'); return; }
  try {
    const res = await axios.post(`${RENDER_URL}/api/listings/bulk`, { listings }, { timeout: 30000 });
    console.log(`Išsiųsta į Render sėkmingai: ${listings.length}. Atsakas:`, res.data);
  } catch (e) { 
    console.log('Duomenų perdavimo į Render klaida:', e.message); 
  }
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== GitHub Actions scraper pradėtas ===');

  const proxies = await getFreeProxies();
  if (proxies.length === 0) {
    console.log('Klaida: Nepavyko gauti proxy sąrašo. Darbas stabdomas.');
    return;
  }

  // Paleidžiame abu skreiperius lygiagrečiai, abu dabar naudoja proxy sąrašą
  const [alioDeals, skelbiuDeals] = await Promise.all([
    scrapeAlio(proxies),
    scrapeSkelbiu(proxies),
  ]);

  const allDeals = [...alioDeals, ...skelbiuDeals];
  console.log(`Iš viso rasta skelbimų iš abiejų šaltinių: ${allDeals.length}`);

  if (allDeals.length === 0) {
    console.log('Naujų skelbimų nerasta, siuntimas atšauktas.');
    return;
  }

  const analyzed = [];
  for (const deal of allDeals) {
    const marketPrice = estimateMarketPrice(deal.title);
    const category = detectCategory(deal.title);
    const discountPct = marketPrice ? Math.round(((marketPrice - deal.price) / marketPrice) * 100) : 0;
    const analysis = await analyzeWithGemini(deal.title, deal.price, marketPrice);
    analyzed.push({ 
      ...deal, 
      market_price: marketPrice, 
      discount_pct: discountPct, 
      category: category || 'kita', 
      score: analysis.score, 
      ai_analysis: JSON.stringify(analysis) 
    });
    await delay(150);
  }

  console.log(`Išsiuntimui paruošti skelbimai: ${analyzed.length}`);
  await sendToRender(analyzed);
  console.log('=== Robotas darbą baigė ===');
}

main().catch(console.error);