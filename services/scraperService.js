/**
 * Law Scraper Service
 * Scrapes law titles and links from all 5 Pakistani government law websites.
 * Each scraper returns: [{ title, link }]
 */

const axios = require('axios');
const cheerio = require('cheerio');

// Shared axios config with browser-like headers to avoid 403s
const axiosConfig = {
    timeout: 15000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
    }
};

// ─────────────────────────────────────────────
// 1. FEDERAL — pakistancode.gov.pk
// ─────────────────────────────────────────────
async function scrapeFederal(alphabet = 'A', page = 1) {
    const baseUrl = 'https://pakistancode.gov.pk';
    const url = `${baseUrl}/english/LGu0xAD?alp=${alphabet}&page=${page}&action=inactive`;

    const { data } = await axios.get(url, axiosConfig);
    const $ = cheerio.load(data);
    const laws = [];

    // The site lists laws in table rows or list items — adjust selector as needed
    $('table tbody tr').each((i, el) => {
        const titleEl = $(el).find('td a').first();
        const title = titleEl.text().trim();
        const href = titleEl.attr('href');
        if (title && href) {
            laws.push({
                title,
                link: href.startsWith('http') ? href : `${baseUrl}${href}`
            });
        }
    });

    // Fallback: try list-based layout
    if (laws.length === 0) {
        $('ul li a, .law-list a, .acts-list a').each((i, el) => {
            const title = $(el).text().trim();
            const href = $(el).attr('href');
            if (title && href && title.length > 3) {
                laws.push({
                    title,
                    link: href.startsWith('http') ? href : `${baseUrl}${href}`
                });
            }
        });
    }

    return laws;
}

// Scrape all alphabets A-Z for federal (or a subset)
async function scrapeAllFederal() {
    const alphabets = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    let allLaws = [];

    for (const alph of alphabets) {
        try {
            let page = 1;
            while (true) {
                const laws = await scrapeFederal(alph, page);
                if (laws.length === 0) break;
                allLaws = allLaws.concat(laws);
                page++;
                if (page > 10) break; // safety cap
                await delay(500); // be polite to server
            }
        } catch (e) {
            console.warn(`Federal scrape failed for alphabet ${alph}:`, e.message);
        }
    }

    return deduplicateByTitle(allLaws);
}

// ─────────────────────────────────────────────
// 2. SINDH — sindhlaws.gov.pk
// ─────────────────────────────────────────────
async function scrapeSindh() {
    const baseUrl = 'https://www.sindhlaws.gov.pk';
    const url = `${baseUrl}/setup_lawsofSindh.aspx`;
    const laws = [];

    try {
        const { data } = await axios.get(url, axiosConfig);
        const $ = cheerio.load(data);

        $('a[href]').each((i, el) => {
            const title = $(el).text().trim();
            const href = $(el).attr('href');
            // Filter for law links (aspx pages with law references)
            if (title && href && title.length > 5 &&
                (href.includes('law') || href.includes('act') || href.includes('ordinance') || href.includes('regulation'))) {
                laws.push({
                    title,
                    link: href.startsWith('http') ? href : `${baseUrl}/${href.replace(/^\//, '')}`
                });
            }
        });

        // If above didn't work, try broader selectors
        if (laws.length === 0) {
            $('td a, li a, .content a').each((i, el) => {
                const title = $(el).text().trim();
                const href = $(el).attr('href');
                if (title && href && title.length > 5 &&
                    (title.match(/Act|Ordinance|Rules|Regulation|Code|Law/i))) {
                    laws.push({
                        title,
                        link: href.startsWith('http') ? href : `${baseUrl}/${href.replace(/^\//, '')}`
                    });
                }
            });
        }
    } catch (e) {
        // Try homepage directly
        const { data } = await axios.get(baseUrl, axiosConfig);
        const $ = cheerio.load(data);
        $('a[href]').each((i, el) => {
            const title = $(el).text().trim();
            const href = $(el).attr('href');
            if (title && href && title.match(/Act|Ordinance|Rules|Regulation|Code/i)) {
                laws.push({
                    title,
                    link: href.startsWith('http') ? href : `${baseUrl}/${href.replace(/^\//, '')}`
                });
            }
        });
    }

    return deduplicateByTitle(laws);
}

// ─────────────────────────────────────────────
// 3. PUNJAB — punjablaws.gov.pk
// ─────────────────────────────────────────────
async function scrapePunjab() {
    const baseUrl = 'https://www.punjablaws.gov.pk';
    const urls = [
        `${baseUrl}/laws1.html`,
        `${baseUrl}/laws2.html`,
        `${baseUrl}/`,
    ];
    let laws = [];

    for (const url of urls) {
        try {
            const { data } = await axios.get(url, axiosConfig);
            const $ = cheerio.load(data);

            $('a[href]').each((i, el) => {
                const title = $(el).text().trim();
                const href = $(el).attr('href');
                if (title && href && title.length > 5 &&
                    (title.match(/Act|Ordinance|Rules|Regulation|Code|Law|Order|Statute/i) ||
                     href.match(/\.html|\.aspx|\/law|\/act/i))) {
                    laws.push({
                        title,
                        link: href.startsWith('http') ? href : `${baseUrl}/${href.replace(/^\//, '')}`
                    });
                }
            });

            if (laws.length > 0) break;
        } catch (e) {
            console.warn(`Punjab scrape failed for ${url}:`, e.message);
        }
    }

    return deduplicateByTitle(laws);
}

// ─────────────────────────────────────────────
// 4. KPK — kpcode.kp.gov.pk
// ─────────────────────────────────────────────
async function scrapeKPK() {
    const baseUrl = 'https://kpcode.kp.gov.pk';
    const url = `${baseUrl}/homepage/alphabetical/F`;
    const laws = [];

    // KPK has alphabetical pages
    const alphabets = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

    for (const alph of alphabets) {
        try {
            const { data } = await axios.get(`${baseUrl}/homepage/alphabetical/${alph}`, axiosConfig);
            const $ = cheerio.load(data);

            $('a[href]').each((i, el) => {
                const title = $(el).text().trim();
                const href = $(el).attr('href');
                if (title && href && title.length > 5 &&
                    !title.match(/^(Home|About|Contact|Search|Back|Next|Previous)$/i)) {
                    laws.push({
                        title,
                        link: href.startsWith('http') ? href : `${baseUrl}${href}`
                    });
                }
            });

            await delay(300);
        } catch (e) {
            console.warn(`KPK scrape failed for alphabet ${alph}:`, e.message);
        }
    }

    return deduplicateByTitle(laws);
}

// ─────────────────────────────────────────────
// 5. BALOCHISTAN — balochistancode.gob.pk
// ─────────────────────────────────────────────
async function scrapeBalochistan() {
    const baseUrl = 'https://balochistancode.gob.pk';
    const urls = [
        `${baseUrl}/Home.aspx`,
        `${baseUrl}/Laws.aspx`,
        baseUrl
    ];
    let laws = [];

    for (const url of urls) {
        try {
            const { data } = await axios.get(url, axiosConfig);
            const $ = cheerio.load(data);

            $('a[href]').each((i, el) => {
                const title = $(el).text().trim();
                const href = $(el).attr('href');
                if (title && href && title.length > 5 &&
                    (title.match(/Act|Ordinance|Rules|Regulation|Code|Law|Order/i) ||
                     href.match(/law|act|ordinance|regulation/i))) {
                    laws.push({
                        title,
                        link: href.startsWith('http') ? href : `${baseUrl}/${href.replace(/^\//, '')}`
                    });
                }
            });

            if (laws.length > 0) break;
        } catch (e) {
            console.warn(`Balochistan scrape failed for ${url}:`, e.message);
        }
    }

    return deduplicateByTitle(laws);
}

// ─────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function deduplicateByTitle(laws) {
    const seen = new Set();
    return laws.filter(law => {
        const key = law.title.toLowerCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

module.exports = {
    scrapeFederal,
    scrapeAllFederal,
    scrapeSindh,
    scrapePunjab,
    scrapeKPK,
    scrapeBalochistan
};
