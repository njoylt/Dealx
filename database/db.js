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
        original_price REAL,
        discount_pct INTEGER,
        url TEXT,
        image_url TEXT,
        category TEXT,
        source TEXT,
        score INTEGER DEFAULT 50,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, callback);
  });
}

function insertListing(listing) {
  return new Promise((resolve, reject) => {
    db.run(`
      INSERT INTO listings 
      (external_id, title, price, original_price, discount_pct, url, image_url, category, source, score, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      listing.external_id || Date.now().toString(),
      listing.title,
      listing.price,
      listing.original_price,
      listing.discount_pct || Math.round(((listing.original_price - listing.price) / listing.original_price) * 100),
      listing.url,
      listing.image_url,
      listing.category || 'other',
      listing.source,
      listing.score || 60,
      listing.description || ''
    ], function(err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });
  });
}

module.exports = { init, insertListing, db };