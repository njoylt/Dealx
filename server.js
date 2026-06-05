require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const db = require('./database/db');
const { scrapeAll } = require('./scrapers/index');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    time: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/api/listings', (req, res) => {
  db.all('SELECT * FROM listings ORDER BY score DESC LIMIT 100', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/deals/best', (req, res) => {
  db.all('SELECT * FROM listings WHERE score >= 70 ORDER BY score DESC LIMIT 20', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/scrape', async (req, res) => {
  try {
    res.json({ message: 'Scraping started...' });
    await scrapeAll();
  } catch (err) {
    console.error('Scrape error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

cron.schedule('*/30 * * * *', async () => {
  console.log('Auto scraping started...');
  try {
    await scrapeAll();
  } catch (err) {
    console.error('Auto scrape failed:', err.message);
  }
});

db.init(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    setTimeout(() => scrapeAll(), 8000);
  });
});

// Bulk endpoint - GitHub Actions siunčia duomenis čia
app.post('/api/listings/bulk', async (req, res) => {
  const { listings } = req.body;
  if (!listings || !Array.isArray(listings)) return res.status(400).json({ error: 'listings array reikalingas' });

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
  console.log(`[Bulk] Išsaugota: ${saved}`);
  res.json({ saved, total: listings.length });
});
