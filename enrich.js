const fs = require('fs');
const https = require('https');
const http = require('http');

const INPUT = '/root/clawd/memory/projects/edclub-customers-names.txt';
const OUTPUT = '/root/clawd/projects/edclub-explorer/enriched-data.json';
const BATCH_SIZE = 20;
const TIMEOUT = 15000;

// Read subdomains
const subdomains = fs.readFileSync(INPUT, 'utf8')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('#'));

console.log(`Total subdomains: ${subdomains.length}`);

// Load existing results
let results = [];
if (fs.existsSync(OUTPUT)) {
    try {
        results = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
        console.log(`Loaded ${results.length} existing results`);
    } catch (e) {
        console.log('Starting fresh');
    }
}

const processed = new Set(results.map(r => r.subdomain));
const remaining = subdomains.filter(s => !processed.has(s));
console.log(`Remaining: ${remaining.length}`);

function fetchPage(subdomain) {
    return new Promise((resolve) => {
        const url = `https://${subdomain}.typingclub.com`;
        const timeout = setTimeout(() => {
            resolve({ subdomain, schoolName: '', url, error: 'timeout' });
        }, TIMEOUT);

        const req = https.get(url, { 
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EdClubEnricher/1.0)' }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                clearTimeout(timeout);
                // Extract h1 content
                const match = data.match(/<h1[^>]*>([^<]+)<\/h1>/i) || 
                              data.match(/<h1[^>]*>\s*([^<]+)/i);
                const schoolName = match ? match[1].trim() : '';
                resolve({ subdomain, schoolName, url });
            });
        });
        
        req.on('error', (err) => {
            clearTimeout(timeout);
            resolve({ subdomain, schoolName: '', url, error: err.message });
        });
        
        req.end();
    });
}

async function processBatch(batch, batchNum, totalBatches) {
    console.log(`\nBatch ${batchNum}/${totalBatches} (${batch.length} items)`);
    const batchResults = await Promise.all(batch.map(fetchPage));
    
    for (const result of batchResults) {
        results.push(result);
        const status = result.schoolName ? '✓' : (result.error || '?');
        console.log(`  ${result.subdomain}: ${result.schoolName || status}`);
    }
    
    // Save after each batch
    fs.writeFileSync(OUTPUT, JSON.stringify(results, null, 2));
    console.log(`  Saved. Total: ${results.length}`);
}

async function main() {
    const totalBatches = Math.ceil(remaining.length / BATCH_SIZE);
    
    for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
        const batch = remaining.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        await processBatch(batch, batchNum, totalBatches);
    }
    
    // Final stats
    const withNames = results.filter(r => r.schoolName).length;
    const withoutNames = results.length - withNames;
    console.log(`\n=== COMPLETE ===`);
    console.log(`Total processed: ${results.length}`);
    console.log(`With school names: ${withNames}`);
    console.log(`Without names: ${withoutNames}`);
}

main().catch(console.error);
