const fs = require('fs');

const data = JSON.parse(fs.readFileSync('enriched-data.json', 'utf8'));
const outputFile = 'enriched-data.json';
const BATCH_SIZE = 10;
const DELAY_MS = 1000;

async function getWaybackDates(subdomain) {
    const url = `${subdomain}.typingclub.com`;
    try {
        // Get first snapshot
        const firstResp = await fetch(
            `https://web.archive.org/cdx/search/cdx?url=${url}&output=json&limit=1&fl=timestamp`
        );
        const firstData = await firstResp.json();
        
        // Get last snapshot
        const lastResp = await fetch(
            `https://web.archive.org/cdx/search/cdx?url=${url}&output=json&limit=-1&fl=timestamp`
        );
        const lastData = await lastResp.json();
        
        let firstSeen = null, lastSeen = null;
        
        if (firstData.length > 1) {
            const ts = firstData[1][0];
            firstSeen = `${ts.slice(0,4)}-${ts.slice(4,6)}-${ts.slice(6,8)}`;
        }
        if (lastData.length > 1) {
            const ts = lastData[lastData.length - 1][0];
            lastSeen = `${ts.slice(0,4)}-${ts.slice(4,6)}-${ts.slice(6,8)}`;
        }
        
        return { firstSeen, lastSeen };
    } catch (e) {
        console.error(`Error for ${subdomain}: ${e.message}`);
        return { firstSeen: null, lastSeen: null };
    }
}

async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function main() {
    console.log(`Enriching ${data.length} entries with Wayback data...`);
    
    let enriched = 0;
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE);
        const promises = batch.map(async (entry) => {
            if (!entry.firstSeen) {
                const dates = await getWaybackDates(entry.subdomain);
                entry.firstSeen = dates.firstSeen;
                entry.lastSeen = dates.lastSeen;
            }
        });
        
        await Promise.all(promises);
        enriched += batch.length;
        
        // Save progress every batch
        fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));
        console.log(`Progress: ${enriched}/${data.length} (${Math.round(enriched/data.length*100)}%)`);
        
        await sleep(DELAY_MS);
    }
    
    console.log('Done!');
}

main();
