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
  if (!db || typeof db.all !== 'function') {
    return res.json({ listings: [] });
  }

  let query = 'SELECT * FROM listings WHERE 1=1';
  const params = [];

  if (req.query.category && req.query.category !== '') {
    query += ' AND category = ?';
    params.push(req.query.category);
  }

  const sort = req.query.sort || 'score';
  if (sort === 'price') {
    query += ' ORDER BY price ASC';
  } else if (sort === 'newest') {
    query += ' ORDER BY created_at DESC';
  } else if (sort === 'discount') {
    query += ' ORDER BY discount_pct DESC';
  } else {
    query += ' ORDER BY score DESC';
  }

  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  query += ' LIMIT ' + limit;

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('DB error [listings]:', err.message);
      return res.json({ listings: [] });
    }
    res.json({ listings: rows || [] });
  });
});

app.get('/api/stats', (req, res) => {
  if (!db || typeof db.all !== 'function') {
    return res.json({ total: 0, hotDeals: 0, avgScore: 0, bestScore: 0 });
  }

  db.all('SELECT COUNT(*) as total, AVG(score) as avgScore, MAX(score) as bestScore FROM listings', [], (err, rows) => {
    if (err || !rows || !rows[0]) {
      return res.json({ total: 0, hotDeals: 0, avgScore: 0, bestScore: 0 });
    }

    const total = rows[0].total || 0;
    const avgScore = rows[0].avgScore || 0;
    const bestScore = rows[0].bestScore || 0;

    db.all('SELECT COUNT(*) as count FROM listings WHERE score >= 70', [], (err2, rows2) => {
      const hotDeals = (rows2 && rows2[0]) ? rows2[0].count : 0;
      res.json({ total, hotDeals, avgScore: Math.round(avgScore), bestScore });
    });
  });
});

app.get('/api/deals/best', (req, res) => {
  if (!db || typeof db.all !== 'function') {
    return res.json({ listings: [] });
  }
  db.all('SELECT * FROM listings WHERE score >= 70 ORDER BY score DESC LIMIT 20', [], (err, rows) => {
    if (err) {
      console.error('DB error [best deals]:', err.message);
      return res.json({ listings: [] });
    }
    res.json({ listings: rows || [] });
  });
});

app.post('/api/scrape', async (req, res) => {
  try {
    res.json({ message: 'Scraping started...' });
    await scrapeAll();
  } catch (err) {
    console.error('Scrape error:', err.message);
  }
});

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
  console.log(`[Bulk] Issaugota nauju skelbimų: ${saved}`);
  res.json({ saved, total: listings.length });
});

cron.schedule('*/30 * * * *', async () => {
  console.log('Auto scraping started from server cron...');
  try {
    await scrapeAll();
  } catch (err) {
    console.error('Auto scrape failed:', err.message);
  }
});

app.use(express.static(path.join(__dirname, 'frontend')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

db.init(() => {
  app.listen(PORT, () => {
    console.log(`Serveris sėkmingai paleistas ant prievado: ${PORT}`);
  });
});
