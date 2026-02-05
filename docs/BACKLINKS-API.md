# EdClub Enrichment - DataForSEO Backlinks API

## Purpose
**Step 0** in the enrichment workflow: Before guessing school/district from subdomain name, check backlinks to find the actual school website linking to it.

## Credentials
- API Login: `adrian@adriancrook.com`
- API Password: `636bda309bca47d7`
- Endpoint: `https://api.dataforseo.com/v3/backlinks/backlinks/live`
- Cost: ~$0.02 per domain check

## Usage

```bash
# Check backlinks for a subdomain
curl -s -X POST "https://api.dataforseo.com/v3/backlinks/backlinks/live" \
  -H "Authorization: Basic $(echo -n 'adrian@adriancrook.com:636bda309bca47d7' | base64)" \
  -H "Content-Type: application/json" \
  -d '[{
    "target": "https://SUBDOMAIN.typingclub.com/",
    "limit": 10,
    "internal_list_limit": 10,
    "backlinks_status_type": "live",
    "include_subdomains": true,
    "exclude_internal_backlinks": true,
    "include_indirect_links": true,
    "mode": "as_is"
  }]'
```

## Interpreting Results

Look for `items[].domain_from` - this tells you which websites link to the TypingClub subdomain.

**Good signals:**
- `*.k12.*.us` domains → school district
- `*.edu` domains → educational institution  
- Domain contains "school", "district", "isd", "usd"
- `domain_from_rank > 10` (more authoritative)
- `backlink_spam_score < 50` (less spammy)

## Workflow

1. **Step 0:** Run backlinks API on `subdomain.typingclub.com`
2. **Step 1:** Look at clues: backlink domains, subdomain name, display name, location
3. **Step 2:** Infer real school/district name and state
4. **Step 3:** Search NCES API: `?name=DISTRICT&state=XX`
5. **Step 4:** Apply match: `POST /api/domains/:subdomain/nces`

## When to Use Backlinks API

- No existing link in the data
- Existing link looks wrong or generic
- Subdomain name is ambiguous (e.g., "ct", "eagles", "wildcats")
- High enrollment number seems wrong for the apparent school size

## Expected Results

Based on testing 25 domains:
- **Success Rate:** ~12% (3 out of 25 found backlinks)
- **Cost per Check:** $0.02
- **Cost per Found Website:** ~$0.17

**Best for:**
- Organization-level domains with high enrollment
- Domains that failed free methods (NCES search, web search)
- High-value sales prospects

**Not recommended for:**
- Teacher/classroom accounts (low hit rate)
- Small schools (<100 students)
- Domains already found via other methods

## Quality Filtering

Look for backlinks where:
- `domain_from` contains: school, edu, k12, isd, district
- `backlink_spam_score < 50`
- `domain_from_rank > 10`
- `is_broken = false`
