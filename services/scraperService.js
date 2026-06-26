/**
 * Law Scraper Service — Professional Version
 * Scrapes real Pakistani government law websites.
 * Uses targeted selectors per website + graceful fallbacks.
 */

const axios   = require('axios');
const cheerio = require('cheerio');

// Browser-like headers to avoid 403s
const axiosConfig = {
    timeout: 30000,
    headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection':      'keep-alive',
    }
};

// Filter out navigation/menu links — only keep real law titles
const isRealLaw = (title) => {
    if (!title || title.length < 8) return false;

    const trimmed = title.trim();

    // Must NOT be a navigation/menu item. Previously this only matched
    // an EXACT single word ("About", "Contact") because the regex was
    // anchored ^...$ with no wildcard — so two-word site-nav labels like
    // "About Us" or "Contact Us" slipped straight through undetected.
    // Allowing optional trailing words (e.g. "Us", "Page") closes that gap.
    const navKeywords = /^(Home|About(\s+Us)?|Contact(\s+Us)?|FAQ|English|Urdu|اردو|Search|Login|Register|Privacy(\s+Policy)?|Terms(\s+(of\s+)?(Use|Service))?|Back|Next|Previous|Download|Print|Share|Links|Sitemap|Feedback|Help|Category\s*Wise|Document\s*Retrieval|Disclaimer)\s*$/i;
    if (navKeywords.test(trimmed)) return false;

    // Site section headers like "Amendment" or "Laws in Alphabetical
    // Order" technically contain a legal keyword (the regex below would
    // match "Amendment" on its own) but are navigation labels, not the
    // name of an actual law — a real amendment's title always names what
    // it amends (e.g. "Companies (Amendment) Act, 2017"). Reject titles
    // that are JUST the bare keyword with nothing else around it.
    const bareCategoryLabel = /^(Amendment|Acts?|Ordinances?|Laws?|Rules?|Regulations?|Codes?|Bills?|Schedules?|Statutes?)(\s+(in\s+)?(Alphabetical\s+)?Order)?\s*$/i;
    if (bareCategoryLabel.test(trimmed)) return false;

    // Must contain legal keywords to even be considered a law title
    const legalKeywords = /Act|Ordinance|Code|Rules|Regulation|Order|Decree|Statute|Law|Bill|Amendment|Schedule|Constitution/i;
    if (!legalKeywords.test(trimmed)) return false;

    // Real law titles virtually always end in a year or "Act/Ordinance/
    // Code" etc. followed by punctuation/number, OR contain multiple
    // words beyond the bare keyword. Reject anything under 3 words,
    // since that's almost always a nav label slipping through
    // ("Category Wise", "Document Retrieval") rather than a genuine
    // title ("Contract Act 1872", "Code of Civil Procedure 1908").
    const wordCount = trimmed.split(/\s+/).length;
    if (wordCount < 3) return false;

    return true;
};

// Helper: sleep
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────
// 1. FEDERAL — pakistancode.gov.pk
// ─────────────────────────────────────────────────────────────
async function scrapeFederal() {
    const laws   = [];
    const base   = 'https://pakistancode.gov.pk';
    const alphabets = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

    for (const alpha of alphabets) {
        try {
            await sleep(1500); // Rate limit
            const url = `${base}/english/LGu0xAD?alp=${alpha}&action=inactive`;
            const { data } = await axios.get(url, axiosConfig);
            const $ = cheerio.load(data);

            // Federal site uses table rows
            $('table tr').each((i, row) => {
                const link = $(row).find('a').first();
                const title = link.text().replace(/\s+/g, ' ').trim();
                const href  = link.attr('href');
                if (title && href && isRealLaw(title)) {
                    laws.push({
                        title,
                        link: href.startsWith('http') ? href : `${base}${href}`
                    });
                }
            });

            // Fallback selector
            if (laws.length === 0) {
                $('a').each((i, el) => {
                    const title = $(el).text().replace(/\s+/g, ' ').trim();
                    const href  = $(el).attr('href');
                    if (title && href && isRealLaw(title) && href.includes('/english/')) {
                        laws.push({
                            title,
                            link: href.startsWith('http') ? href : `${base}${href}`
                        });
                    }
                });
            }
        } catch (err) {
            console.error(`[Federal] Alphabet ${alpha} failed: ${err.message}`);
        }
    }

    // Deduplicate by title
    const seen = new Set();
    return laws.filter(l => {
        if (seen.has(l.title)) return false;
        seen.add(l.title);
        return true;
    });
}

// ─────────────────────────────────────────────────────────────
// 2. SINDH — sindhlaw.gov.pk or sindhlaws.gov.pk
// ─────────────────────────────────────────────────────────────
async function scrapeSindh() {
    const laws = [];
    const urls = [
        'http://www.sindhlaws.gov.pk/setup/publications/category.aspx',
        'http://www.sindhlaws.gov.pk',
        'https://sindhlaw.gov.pk'
    ];

    for (const url of urls) {
        try {
            await sleep(1000);
            const { data } = await axios.get(url, axiosConfig);
            const $ = cheerio.load(data);

            $('a').each((i, el) => {
                const title = $(el).text().replace(/\s+/g, ' ').trim();
                const href  = $(el).attr('href') || '';
                if (title && isRealLaw(title)) {
                    const base = new URL(url).origin;
                    laws.push({
                        title,
                        link: href.startsWith('http') ? href : `${base}/${href.replace(/^\//, '')}`
                    });
                }
            });

            if (laws.length > 0) break;
        } catch (err) {
            console.error(`[Sindh] ${url} failed: ${err.message}`);
        }
    }

    const seen = new Set();
    return laws.filter(l => { if (seen.has(l.title)) return false; seen.add(l.title); return true; });
}

// ─────────────────────────────────────────────────────────────
// 3. PUNJAB — punjablaws.gov.pk
// ─────────────────────────────────────────────────────────────
async function scrapePunjab() {
    const laws = [];
    const base = 'https://www.punjablaws.gov.pk';
    const pages = [`${base}/laws1.html`, `${base}/laws2.html`, `${base}/laws3.html`, `${base}/`];

    for (const url of pages) {
        try {
            await sleep(1000);
            const { data } = await axios.get(url, axiosConfig);
            const $ = cheerio.load(data);

            $('a').each((i, el) => {
                const title = $(el).text().replace(/\s+/g, ' ').trim();
                const href  = $(el).attr('href') || '';
                if (title && isRealLaw(title)) {
                    laws.push({
                        title,
                        link: href.startsWith('http') ? href : `${base}/${href.replace(/^\//, '')}`
                    });
                }
            });
        } catch (err) {
            console.error(`[Punjab] ${url} failed: ${err.message}`);
        }
    }

    const seen = new Set();
    return laws.filter(l => { if (seen.has(l.title)) return false; seen.add(l.title); return true; });
}

// ─────────────────────────────────────────────────────────────
// 4. KPK — kpcode.gov.pk
// ─────────────────────────────────────────────────────────────
async function scrapeKpk() {
    const laws = [];
    const base = 'https://kpcode.gov.pk';
    const alphabets = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

    // Try main page first
    try {
        await sleep(1000);
        const { data } = await axios.get(`${base}/english/`, axiosConfig);
        const $ = cheerio.load(data);
        $('a').each((i, el) => {
            const title = $(el).text().replace(/\s+/g, ' ').trim();
            const href  = $(el).attr('href') || '';
            if (title && isRealLaw(title)) {
                laws.push({ title, link: href.startsWith('http') ? href : `${base}${href}` });
            }
        });
    } catch (err) {
        console.error(`[KPK] Main page failed: ${err.message}`);
    }

    // Try alphabetical pages
    if (laws.length < 5) {
        for (const alpha of alphabets) {
            try {
                await sleep(1000);
                const url = `${base}/english/LGu0xAD?alp=${alpha}&action=inactive`;
                const { data } = await axios.get(url, axiosConfig);
                const $ = cheerio.load(data);
                $('table tr a, a').each((i, el) => {
                    const title = $(el).text().replace(/\s+/g, ' ').trim();
                    const href  = $(el).attr('href') || '';
                    if (title && isRealLaw(title)) {
                        laws.push({ title, link: href.startsWith('http') ? href : `${base}${href}` });
                    }
                });
            } catch (err) {
                // Silent fail per alphabet
            }
        }
    }

    const seen = new Set();
    return laws.filter(l => { if (seen.has(l.title)) return false; seen.add(l.title); return true; });
}

// ─────────────────────────────────────────────────────────────
// 5. BALOCHISTAN — balochistandcode.gov.pk or similar
// ─────────────────────────────────────────────────────────────
async function scrapeBalochistan() {
    const laws = [];
    const urls = [
        'https://www.balochistandcode.gov.pk',
        'https://balochistandcode.gov.pk/laws',
        'https://balochistandcode.gov.pk/english',
    ];

    for (const url of urls) {
        try {
            await sleep(1000);
            const { data } = await axios.get(url, axiosConfig);
            const $ = cheerio.load(data);
            $('a').each((i, el) => {
                const title = $(el).text().replace(/\s+/g, ' ').trim();
                const href  = $(el).attr('href') || '';
                if (title && isRealLaw(title)) {
                    const base = new URL(url).origin;
                    laws.push({ title, link: href.startsWith('http') ? href : `${base}/${href.replace(/^\//, '')}` });
                }
            });
            if (laws.length > 0) break;
        } catch (err) {
            console.error(`[Balochistan] ${url} failed: ${err.message}`);
        }
    }

    const seen = new Set();
    return laws.filter(l => { if (seen.has(l.title)) return false; seen.add(l.title); return true; });
}

// ─────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────
module.exports = {
    scrapeLaws: async function(source) {
        console.log(`[SCRAPER] Starting scrape for source: ${source}`);
        try {
            let laws = [];
            switch (source) {
                case 'federal':     laws = await scrapeFederal();     break;
                case 'sindh':       laws = await scrapeSindh();       break;
                case 'punjab':      laws = await scrapePunjab();      break;
                case 'kpk':         laws = await scrapeKpk();         break;
                case 'balochistan': laws = await scrapeBalochistan(); break;
                default: throw new Error(`Unknown source: ${source}`);
            }
            console.log(`[SCRAPER] Found ${laws.length} laws for ${source}`);
            return laws;
        } catch (err) {
            console.error(`[SCRAPER] Fatal error for ${source}:`, err.message);
            return [];
        }
    }
};
