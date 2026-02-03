const fs = require('fs');

const data = JSON.parse(fs.readFileSync('enriched-data.json', 'utf8'));
const outputFile = 'enriched-data.json';
const DELAY_MS = 2000; // 2 seconds between each request

async function getWaybackDates(subdomain, retries = 3) {
    const url = `${subdomain}.typingclub.com`;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            // Get first and last snapshots in one call
            const resp = await fetch(
                `https://web.archive.org/cdx/search/cdx?url=${url}&output=json&fl=timestamp&collapse=timestamp:8`,
                { timeout: 30000 }
            );
            
            if (resp.status === 429) {
                console.log(`Rate limited on ${subdomain}, waiting 60s...`);
                await sleep(60000);
                continue;
            }
            
            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }
            
            const records = await resp.json();
            
            let firstSeen = null, lastSeen = null;
            
            if (records.length > 1) {
                // First row is header ["timestamp"], rest is data
                const timestamps = records.slice(1).map(r => r[0]);
                if (timestamps.length > 0) {
                    const first = timestamps[0];
                    const last = timestamps[timestamps.length - 1];
                    firstSeen = `${first.slice(0,4)}-${first.slice(4,6)}-${first.slice(6,8)}`;
                    lastSeen = `${last.slice(0,4)}-${last.slice(4,6)}-${last.slice(6,8)}`;
                }
            }
            
            return { firstSeen, lastSeen };
        } catch (e) {
            if (attempt === retries) {
                console.error(`Failed ${subdomain}: ${e.message}`);
                return { firstSeen: null, lastSeen: null };
            }
            await sleep(5000 * attempt);
        }
    }
    return { firstSeen: null, lastSeen: null };
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function main() {
    // Find where we left off
    let startIndex = 0;
    for (let i = 0; i < data.length; i++) {
        if (data[i].firstSeen === undefined) {
            startIndex = i;
            break;
        }
        if (i === data.length - 1) {
            console.log('All entries already enriched!');
            return;
        }
    }
    
    console.log(`Resuming from index ${startIndex}...`);
    console.log(`Enriching ${data.length - startIndex} remaining entries with Wayback data...`);
    
    for (let i = startIndex; i < data.length; i++) {
        const entry = data[i];
        
        if (entry.firstSeen !== undefined) continue; // Already processed
        
        const dates = await getWaybackDates(entry.subdomain);
        entry.firstSeen = dates.firstSeen;
        entry.lastSeen = dates.lastSeen;
        
        // Save after each entry
        fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));
        
        const pct = Math.round((i + 1) / data.length * 100);
        const status = dates.firstSeen ? `✓ ${dates.firstSeen} → ${dates.lastSeen}` : '✗ no data';
        console.log(`[${i + 1}/${data.length}] ${pct}% ${entry.subdomain}: ${status}`);
        
        await sleep(DELAY_MS);
    }
    
    console.log('Done!');
}

main().catch(console.error);
