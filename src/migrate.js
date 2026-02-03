// One-time migration: import existing JSON data to Supabase
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

async function migrate() {
    const data = JSON.parse(fs.readFileSync('enriched-data.json', 'utf8'));
    console.log(`Migrating ${data.length} records to Supabase...`);
    
    const BATCH_SIZE = 100;
    let imported = 0;
    
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE).map(d => ({
            subdomain: d.subdomain,
            school_name: d.schoolName || null,
            source: d.source || 'commoncrawl',
            typingclub_valid: d.typingclubValid ?? null,
            edclub_valid: d.edclubValid ?? null,
            valid_domains: d.validDomains || null,
            validated_at: d.validDomains ? new Date().toISOString() : null,
            wayback_first: d.waybackFirst || null,
            wayback_last: d.waybackLast || null,
            wayback_checked_at: d.waybackFirst ? new Date().toISOString() : null
        }));
        
        const { error } = await supabase
            .from('domains')
            .upsert(batch, { onConflict: 'subdomain' });
        
        if (error) {
            console.error(`Batch ${i} error:`, error.message);
        } else {
            imported += batch.length;
            console.log(`Imported ${imported}/${data.length}`);
        }
    }
    
    console.log('✅ Migration complete!');
}

migrate().catch(console.error);
