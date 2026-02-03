-- Supabase schema for EdClub competitor intel

CREATE TABLE IF NOT EXISTS domains (
    id SERIAL PRIMARY KEY,
    subdomain VARCHAR(255) UNIQUE NOT NULL,
    school_name VARCHAR(500),
    source VARCHAR(50) DEFAULT 'commoncrawl',
    
    -- Validation
    typingclub_valid BOOLEAN,
    edclub_valid BOOLEAN,
    valid_domains VARCHAR(20), -- 'both', 'typingclub', 'edclub', 'neither'
    validated_at TIMESTAMPTZ,
    
    -- Wayback enrichment
    wayback_first DATE,
    wayback_last DATE,
    wayback_checked_at TIMESTAMPTZ,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick filtering
CREATE INDEX idx_domains_valid ON domains(valid_domains);
CREATE INDEX idx_domains_wayback ON domains(wayback_last);
CREATE INDEX idx_domains_source ON domains(source);

-- View for dashboard stats
CREATE VIEW domain_stats AS
SELECT 
    COUNT(*) as total,
    COUNT(CASE WHEN validated_at IS NOT NULL THEN 1 END) as validated,
    COUNT(CASE WHEN wayback_checked_at IS NOT NULL THEN 1 END) as wayback_enriched,
    COUNT(CASE WHEN wayback_last >= '2026-01-01' THEN 1 END) as active_2026,
    COUNT(CASE WHEN valid_domains = 'neither' THEN 1 END) as dead
FROM domains;
