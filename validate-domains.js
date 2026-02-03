const fs = require('fs');

const data = JSON.parse(fs.readFileSync('enriched-data.json', 'utf8'));
const BATCH_SIZE = 20;
const DELAY_MS = 500;

async function checkDomain(subdomain, domain) {
    try {
        const url = `https://${subdomain}.${domain}/`;
        const resp = await fetch(url, { 
            method: 'HEAD', 
            redirect: 'follow',
            signal: AbortSignal.timeout(5000)
        });
        return resp.status === 200;
    } catch (e) {
        return false;
    }
}

async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function main() {
    console.log(`Validating ${data.length} subdomains...`);
    
    let validated = 0;
    let typingclubOnly = 0;
    let edclubOnly = 0;
    let both = 0;
    let neither = 0;
    
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async (entry) => {
            // Skip if already validated
            if (entry.validDomains) return;
            
            const [tc, ec] = await Promise.all([
                checkDomain(entry.subdomain, 'typingclub.com'),
                checkDomain(entry.subdomain, 'edclub.com')
            ]);
            
            entry.typingclubValid = tc;
            entry.edclubValid = ec;
            
            if (tc && ec) {
                entry.validDomains = 'both';
                both++;
            } else if (tc) {
                entry.validDomains = 'typingclub';
                typingclubOnly++;
            } else if (ec) {
                entry.validDomains = 'edclub';
                edclubOnly++;
            } else {
                entry.validDomains = 'none';
                neither++;
            }
        }));
        
        validated += batch.length;
        
        // Save progress
        fs.writeFileSync('enriched-data.json', JSON.stringify(data, null, 2));
        
        const pct = Math.round(validated / data.length * 100);
        console.log(`[${validated}/${data.length}] ${pct}% - TC:${typingclubOnly} EC:${edclubOnly} Both:${both} None:${neither}`);
        
        await sleep(DELAY_MS);
    }
    
    console.log('\nFinal stats:');
    console.log(`  TypingClub only: ${typingclubOnly}`);
    console.log(`  EdClub only: ${edclubOnly}`);
    console.log(`  Both domains: ${both}`);
    console.log(`  Neither (dead): ${neither}`);
}

main().catch(console.error);
