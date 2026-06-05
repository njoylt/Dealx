const { scrapeSkelbiu } = require('./skelbiu');
const { scrapeVinted } = require('./vinted');

async function scrapeAll() {
  console.log('=== DealFinder scraping pradėtas ===');
  const results = { skelbiu: 0, vinted: 0, errors: [] };
  try { results.skelbiu = await scrapeSkelbiu(); } catch (e) { results.errors.push('skelbiu: ' + e.message); }
  try { results.vinted = await scrapeVinted(); } catch (e) { results.errors.push('vinted: ' + e.message); }
  console.log('=== Scraping baigtas ===', results);
  return results;
}

module.exports = { scrapeAll };
