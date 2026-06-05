const puppeteer = require('puppeteer');

async function scrapeFacebookMarketplace(location = 'vilnius', category = 'vehicles', pages = 1) {
    const listings = [];
    let browser;

    try {
        browser = await puppeteer.launch({
            headless: process.env.HEADLESS !== 'false',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        // Facebook Marketplace requires login, so we use public search
        // This is a simplified version - real FB scraping needs cookies/session
        const searchUrl = `https://www.facebook.com/marketplace/${location}/search/?query=${category}`;

        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

        // Wait for listings to load
        await page.waitForSelector('[data-testid="marketplace_search_results"]', { timeout: 10000 });

        const items = await page.evaluate(() => {
            const results = [];
            const cards = document.querySelectorAll('[data-testid="marketplace_search_results"] > div');

            cards.forEach(card => {
                const titleEl = card.querySelector('span[dir="auto"]');
                const priceEl = card.querySelector('span[dir="auto"]');
                const imgEl = card.querySelector('img');
                const linkEl = card.querySelector('a');

                if (titleEl && priceEl) {
                    const priceText = priceEl.textContent || '';
                    const price = parseFloat(priceText.replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;

                    results.push({
                        title: titleEl.textContent || '',
                        price: price,
                        currency: 'EUR',
                        source: 'facebook',
                        sourceUrl: linkEl ? linkEl.href : '',
                        imageUrl: imgEl ? imgEl.src : '',
                        location: 'Vilnius',
                        condition: 'used'
                    });
                }
            });

            return results;
        });

        listings.push(...items);

    } catch (error) {
        console.error('Facebook scraping error:', error.message);
    } finally {
        if (browser) await browser.close();
    }

    return listings;
}

module.exports = { scrapeFacebookMarketplace };
