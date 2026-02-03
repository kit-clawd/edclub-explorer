// Railway worker - runs continuously until all domains enriched
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

const BATCH_SIZE = 20;
const WAYBACK_DELAY = 2000;
const VALIDATE_DELAY = 500;

async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ============ VALIDATION ============
async function checkDomain(subdomain, domain) {
    try {
        const url = `https://${subdomain}.${domain}/`;
        const resp = await fetch(url, { 
            method: 'HEAD', 
            redirect: 'follow',
            signal: AbortSignal.timeout(5000)
        });
        return resp.status === 200;
    } catch {
        return false;
    }
}

async function validateBatch() {
    // Get unvalidated domains
    const { data: domains, error } = await supabase
        .from('domains')
        .select('id, subdomain')
        .is('validated_at', null)
        .limit(BATCH_SIZE);
    
    if (error || !domains?.length) return 0;
    
    console.log(`Validating batch of ${domains.length}...`);
    
    await Promise.all(domains.map(async (d) => {
        const [tc, ec] = await Promise.all([
            checkDomain(d.subdomain, 'typingclub.com'),
            checkDomain(d.subdomain, 'edclub.com')
        ]);
        
        let validDomains = 'neither';
        if (tc && ec) validDomains = 'both';
        else if (tc) validDomains = 'typingclub';
        else if (ec) validDomains = 'edclub';
        
        await supabase.from('domains').update({
            typingclub_valid: tc,
            edclub_valid: ec,
            valid_domains: validDomains,
            validated_at: new Date().toISOString()
        }).eq('id', d.id);
    }));
    
    return domains.length;
}

// ============ WAYBACK ============
async function getWaybackDates(subdomain) {
    const url = `${subdomain}.typingclub.com`;
    try {
        const resp = await fetch(
            `https://web.archive.org/cdx/search/cdx?url=${url}&output=json&fl=timestamp&collapse=timestamp:8`,
            { signal: AbortSignal.timeout(30000) }
        );
        
        if (resp.status === 429) {
            console.log('Rate limited, waiting 60s...');
            await sleep(60000);
            return null; // Retry later
        }
        
        if (!resp.ok) return { first: null, last: null };
        
        const records = await resp.json();
        if (records.length <= 1) return { first: null, last: null };
        
        const timestamps = records.slice(1).map(r => r[0]);
        const first = timestamps[0];
        const last = timestamps[timestamps.length - 1];
        
        return {
            first: `${first.slice(0,4)}-${first.slice(4,6)}-${first.slice(6,8)}`,
            last: `${last.slice(0,4)}-${last.slice(4,6)}-${last.slice(6,8)}`
        };
    } catch (e) {
        console.error(`Wayback error for ${subdomain}: ${e.message}`);
        return { first: null, last: null };
    }
}

async function enrichWaybackBatch() {
    // Get domains without wayback data
    const { data: domains, error } = await supabase
        .from('domains')
        .select('id, subdomain')
        .is('wayback_checked_at', null)
        .limit(1); // One at a time for rate limiting
    
    if (error || !domains?.length) return 0;
    
    const d = domains[0];
    console.log(`Wayback: ${d.subdomain}`);
    
    const dates = await getWaybackDates(d.subdomain);
    if (dates === null) return 1; // Rate limited, will retry
    
    await supabase.from('domains').update({
        wayback_first: dates.first,
        wayback_last: dates.last,
        wayback_checked_at: new Date().toISOString()
    }).eq('id', d.id);
    
    await sleep(WAYBACK_DELAY);
    return 1;
}

// ============ MAIN LOOP ============
async function main() {
    console.log('🚀 EdClub enrichment worker starting...');
    
    while (true) {
        // Check progress
        const { data: stats } = await supabase.from('domain_stats').select('*').single();
        console.log(`Progress: ${stats?.validated || 0}/${stats?.total || 0} validated, ${stats?.wayback_enriched || 0} wayback`);
        
        // Prioritize validation (faster), then wayback
        const validated = await validateBatch();
        if (validated > 0) {
            await sleep(VALIDATE_DELAY);
            continue;
        }
        
        const enriched = await enrichWaybackBatch();
        if (enriched > 0) continue;
        
        // All done!
        console.log('✅ All enrichment complete! Sleeping 1 hour...');
        await sleep(3600000);
    }
}

main().catch(console.error);
