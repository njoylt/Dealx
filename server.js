require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');
const db = require('./database/db');
const { scrapeAll } = require('./scrapers/index');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Logeris – konsolėje rodys visas užklausas
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// API Sveikatos patikrinimas
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    time: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Saugus endpoint'as visiems skelbimams gauti
app.get('/api/listings', (req, res) => {
  if (!db || typeof db.all !== 'function') {
    return res.json([]);
  }
  db.all('SELECT * FROM listings ORDER BY score DESC LIMIT 100', [], (err, rows) => {
    if (err) {
      console.error('DB error [listings]:', err.message);
      return res.json([]); // Grąžinam [], kad frontend nesulūžtų
    }
    res.json(rows || [
  });
});

// Saugus endpoint'as geriausiems skelbimams gauti (score >= 70)
app.get('/api/deals/best', (req, res) => {
  if (!db || typeof db.all !== 'function') {
    return res.json([]);
  }
  db.all('SELECT * FROM listings WHERE score >= 70 ORDER BY score DESC LIMIT 20', [], (err, rows) => {
    if (err) {
      console.error('DB error [best deals]:', err.message);
      return res.json([]); // Grąžinam [], kad frontend nesulūžtų
    }
    res.json({ listings: rows || [] });
  });
});

// Rankinis skreipinimo paleidimas iš serverio pusės (jei prireiktų)
app.post('/api/scrape', async (req, res) => {
  try {
    res.json({ message: 'Scraping started...' });
    await scrapeAll();
  } catch (err) {
    console.error('Scrape error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Bulk endpoint - GitHub Actions siunčia surinktus duomenis čia
app.post('/api/listings/bulk', async (req, res) => {
  const { listings } = req.body;
  if (!listings || !Array.isArray(listings)) {
    return res.status(400).json({ error: 'listings array reikalingas' });
  }

  let saved = 0;
  for (const item of listings) {
    await new Promise((resolve) => {
      db.upsertListing({
        external_id: item.id,
        title: item.title,
        price: item.price,
        market_price: item.market_price,
        discount_pct: item.discount_pct,
        score: item.score,
        category: item.category,
        source: item.source,
        url: item.url,
        image_url: item.image,
        description: '',
        location: item.location,
        ai_analysis: item.ai_analysis,
      }, resolve);
    });
    saved++;
  }
  console.log(`[Bulk] Išsaugota naujų skelbimų: ${saved}`);
  res.json({ saved, total: listings.length });
});

// Rezervinis automatinis skreiperio paleidimas kas 30 minučių pačiame serveryje
cron.schedule('*/30 * * * *', async () => {
  console.log('Auto scraping started from server cron...');
  try {
    await scrapeAll();
  } catch (err) {
    console.error('Auto scrape failed:', err.message);
  }
});

// --- FRONTEND APILINKĖS APTARNAVIMAS ---
// Nurodom Express, kad 'frontend' aplankas turi statinius failus (css, js, paveiksliukus)
app.use(express.static(path.join(__dirname, 'frontend')));

// Svarbiausia dalis: atidarius pagrindinį puslapį, gražiname index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});
// ----------------------------------------

// Serverio paleidimas po DB inicializacijos
db.init(() => {
  app.listen(PORT, () => {
    console.log(`Serveris sėkmingai paleistas ant prievado: ${PORT}`);
  });
});
