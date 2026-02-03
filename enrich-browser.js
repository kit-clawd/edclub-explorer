const { chromium } = require('playwright');
const fs = require('fs');

const DATA_FILE = 'enriched-data.json';
const CONCURRENT = 3;
const WAIT_MS = 3000;

async function fetchSchoolName(page, subdomain) {
    // Try edclub first (usually has better names)
    for (const domain of ['edclub.com', 'typingclub.com']) {
        const url = `https://${subdomain}.${domain}`;
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
            await page.waitForTimeout(WAIT_MS);
            
            const schoolName = await page.evaluate(() => {
                // Try h1 first
                const h1 = document.querySelector('h1');
                if (h1) {
                    const text = h1.textContent.trim();
                    if (text && text.length > 2 && text.length < 100 && 
                        !text.toLowerCase().includes('login') &&
                        !text.toLowerCase().includes('learn, teach')) {
                        return text;
                    }
                }
                
                // Try .school-name class
                const schoolEl = document.querySelector('.school-name, [class*="school"]');
                if (schoolEl) {
                    const text = schoolEl.textContent.trim();
                    if (text && text.length > 2 && text.length < 100) {
                        return text;
                    }
                }
                
                return null;
            });
            
            if (schoolName) return schoolName;
        } catch (e) {
            // Try next domain
        }
    }
    return null;
}

async function main() {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    
    // Filter entries that need enrichment
    const needsEnrichment = data.filter(d => !d.schoolName || d.schoolName === 'Learn, teach, create! edclub');
    console.log(`${needsEnrichment.length} entries need school name enrichment`);
    
    if (needsEnrichment.length === 0) {
        console.log('All entries already have school names!');
        return;
    }
    
    let browser;
    try {
        browser = await chromium.connectOverCDP('http://127.0.0.1:18800');
        console.log('Connected to browser');
    } catch (e) {
        console.log('Could not connect to browser. Starting new instance...');
        browser = await chromium.launch({ headless: true });
    }
    
    let enriched = 0;
    let failed = 0;
    
    for (let i = 0; i < needsEnrichment.length; i += CONCURRENT) {
        const batch = needsEnrichment.slice(i, i + CONCURRENT);
        
        const pages = await Promise.all(
            batch.map(async () => {
                const context = await browser.newContext({
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                });
                return context.newPage();
            })
        );
        
        await Promise.all(batch.map(async (entry, idx) => {
            const name = await fetchSchoolName(pages[idx], entry.subdomain);
            if (name) {
                entry.schoolName = name;
                enriched++;
            } else {
                failed++;
            }
        }));
        
        // Close pages
        await Promise.all(pages.map(p => p.context().close()));
        
        // Save progress
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        
        const processed = Math.min(i + CONCURRENT, needsEnrichment.length);
        const pct = Math.round(processed / needsEnrichment.length * 100);
        console.log(`[${processed}/${needsEnrichment.length}] ${pct}% - Enriched: ${enriched}, Failed: ${failed}`);
    }
    
    if (!browser.isConnected()) {
        await browser.close();
    }
    
    console.log(`\nDone! Enriched ${enriched} school names, ${failed} failed`);
}

main().catch(console.error);
