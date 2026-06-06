const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'deals.db');
const db = new sqlite3.Database(dbPath);

function init(callback) {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS listings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id TEXT UNIQUE,
        title TEXT,
        price REAL,
        market_price REAL,
        discount_pct INTEGER,
        url TEXT,
        image_url TEXT,
        category TEXT,
        source TEXT,
        score INTEGER DEFAULT 50,
        description TEXT,
        location TEXT,
        ai_analysis TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, callback);
  });
}

// Funkcija, kurią naudoja serveris užklausoms (SELECT)
function all(query, params, callback) {
  return db.all(query, params, callback);
}

// Tobula „Upsert“ funkcija – jei skelbimas jau yra, jį atnaujina, jei nėra – įrašo naują
function upsertListing(listing, callback) {
  const query = `
    INSERT INTO listings 
    (external_id, title, price, market_price, discount_pct, url, image_url, category, source, score, description, location, ai_analysis)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(external_id) DO UPDATE SET
      price = excluded.price,
      market_price = excluded.market_price,
      discount_pct = excluded.discount_pct,
      score = excluded.score,
      ai_analysis = excluded.ai_analysis
  `;

  const params = [
    listing.external_id || Date.now().toString(),
    listing.title,
    listing.price,
    listing.market_price || listing.original_price,
    listing.discount_pct || 0,
    listing.url,
    listing.image_url,
    listing.category || 'other',
    listing.source,
    listing.score || 50,
    listing.description || '',
    listing.location || '',
    listing.ai_analysis || ''
  ];

  db.run(query, params, function(err) {
    if (err) {
      console.error('Klaida darant upsert:', err.message);
    }
    if (callback) callback(err, this ? this.lastID : null);
  });
}

module.exports = { 
  init, 
  all, 
  upsertListing, 
  db 
};
