const { chromium } = require('playwright');
const fs = require('fs');

const INPUT = '/root/clawd/memory/projects/edclub-customers-names.txt';
const OUTPUT = '/root/clawd/projects/edclub-explorer/enriched-data.json';
const CONCURRENT = 5;  // Number of parallel pages
const WAIT_MS = 4000;  // Wait for Cloudflare + page load

// Read subdomains
const subdomains = fs.readFileSync(INPUT, 'utf8')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('#') && !s.includes('www') && s !== 's' && s !== 'static' && s !== 'blog' && s !== 'apps' && s !== 'beta' && s !== 'feedback');

console.log(`Total subdomains: ${subdomains.length}`);

// Load existing results
let results = [];
if (fs.existsSync(OUTPUT)) {
    try {
        const data = fs.readFileSync(OUTPUT, 'utf8');
        if (data && data.trim() !== '[]') {
            results = JSON.parse(data);
        }
        console.log(`Loaded ${results.length} existing results`);
    } catch (e) {
        console.log('Starting fresh');
    }
}

const processed = new Set(results.map(r => r.subdomain));
const remaining = subdomains.filter(s => !processed.has(s));
console.log(`Remaining: ${remaining.length}`);

async function fetchSchoolName(page, subdomain) {
    const url = `https://${subdomain}.typingclub.com`;
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(WAIT_MS);
        
        const schoolName = await page.evaluate(() => {
            const h1 = document.querySelector('h1');
            return h1 ? h1.textContent.trim() : '';
        });
        
        return { subdomain, schoolName, url };
    } catch (error) {
        console.log(`  Error ${subdomain}: ${error.message.slice(0, 50)}`);
        return { subdomain, schoolName: '', url, error: error.message.slice(0, 100) };
    }
}

async function processBatch(browser, batch, batchNum, totalBatches) {
    console.log(`\nBatch ${batchNum}/${totalBatches} (${batch.length} items)`);
    
    const pages = await Promise.all(
        batch.map(async () => {
            const context = await browser.newContext();
            return context.newPage();
        })
    );
    
    const batchResults = await Promise.all(
        batch.map((subdomain, i) => fetchSchoolName(pages[i], subdomain))
    );
    
    // Close pages
    await Promise.all(pages.map(p => p.context().close()));
    
    for (const result of batchResults) {
        results.push(result);
        const status = result.schoolName || result.error || '?';
        console.log(`  ${result.subdomain}: ${status.slice(0, 50)}`);
    }
    
    // Save after each batch
    fs.writeFileSync(OUTPUT, JSON.stringify(results, null, 2));
    console.log(`  Saved. Total: ${results.length}`);
}

async function main() {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:18800');
    console.log('Connected to browser');
    
    const totalBatches = Math.ceil(remaining.length / CONCURRENT);
    
    for (let i = 0; i < remaining.length; i += CONCURRENT) {
        const batch = remaining.slice(i, i + CONCURRENT);
        const batchNum = Math.floor(i / CONCURRENT) + 1;
        await processBatch(browser, batch, batchNum, totalBatches);
    }
    
    // Final stats
    const withNames = results.filter(r => r.schoolName && !r.schoolName.includes('moment')).length;
    const withoutNames = results.length - withNames;
    console.log(`\n=== COMPLETE ===`);
    console.log(`Total processed: ${results.length}`);
    console.log(`With school names: ${withNames}`);
    console.log(`Without names: ${withoutNames}`);
}

main().catch(console.error);
