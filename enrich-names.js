const fs = require('fs');

const data = JSON.parse(fs.readFileSync('enriched-data.json', 'utf8'));
const BATCH_SIZE = 5;
const DELAY_MS = 1000;

async function getSchoolName(subdomain) {
    // Try edclub first (usually has better names), then typingclub
    for (const domain of ['edclub.com', 'typingclub.com']) {
        try {
            const url = `https://${subdomain}.${domain}/`;
            const resp = await fetch(url, {
                signal: AbortSignal.timeout(10000),
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            if (resp.status !== 200) continue;
            
            const html = await resp.text();
            
            // Try to extract school name from various places
            // 1. Look for h1 with school name
            let match = html.match(/<h1[^>]*class="[^"]*school-name[^"]*"[^>]*>([^<]+)<\/h1>/i);
            if (match) return match[1].trim();
            
            // 2. Look for title tag
            match = html.match(/<title>([^<|]+)/i);
            if (match) {
                const title = match[1].trim();
                // Clean up common suffixes
                const cleaned = title
                    .replace(/\s*[-–|]\s*(TypingClub|EdClub|Login|Portal).*$/i, '')
                    .replace(/\s*TypingClub\s*$/i, '')
                    .replace(/\s*EdClub\s*$/i, '')
                    .trim();
                if (cleaned && cleaned.length > 2 && cleaned !== subdomain) {
                    return cleaned;
                }
            }
            
            // 3. Look for og:site_name or og:title
            match = html.match(/<meta\s+property="og:(site_name|title)"\s+content="([^"]+)"/i);
            if (match) {
                const name = match[2].trim()
                    .replace(/\s*[-–|]\s*(TypingClub|EdClub).*$/i, '')
                    .trim();
                if (name && name.length > 2) return name;
            }
            
            // 4. Look for any h1
            match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
            if (match) {
                const h1 = match[1].trim();
                if (h1 && h1.length > 2 && h1.length < 100 && !h1.toLowerCase().includes('login')) {
                    return h1;
                }
            }
            
        } catch (e) {
            // Try next domain
        }
    }
    return null;
}

async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function main() {
    // Count entries without school names
    const needsEnrichment = data.filter(d => !d.schoolName);
    console.log(`${needsEnrichment.length} entries need school name enrichment`);
    
    let enriched = 0;
    let failed = 0;
    
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async (entry) => {
            if (entry.schoolName) return; // Already has name
            
            const name = await getSchoolName(entry.subdomain);
            if (name) {
                entry.schoolName = name;
                enriched++;
            } else {
                failed++;
            }
        }));
        
        // Save progress
        fs.writeFileSync('enriched-data.json', JSON.stringify(data, null, 2));
        
        const processed = Math.min(i + BATCH_SIZE, data.length);
        const pct = Math.round(processed / data.length * 100);
        console.log(`[${processed}/${data.length}] ${pct}% - Enriched: ${enriched}, Failed: ${failed}`);
        
        await sleep(DELAY_MS);
    }
    
    console.log(`\nDone! Enriched ${enriched} school names, ${failed} failed`);
}

main().catch(console.error);
