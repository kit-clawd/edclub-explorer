# EdClub Explorer Enrichment Workflow

Complete workflow for enriching EdClub/TypingClub domain records with accurate school data.

---

## Overview

**Goal:** For each subdomain, find the correct school/district, location, and enrollment data.

**Problem:** Many records have:
- Wrong or missing city/state
- Incorrect NCES enrollment (applied from wrong school)
- Ambiguous names ("CT", "eagles", "wildcats")
- No link to verify the school

---

## Step 0: Backlinks Lookup (First Step)

**Always run this when:**
- No URL/link exists for the subdomain
- Existing URL looks suspicious (generic, broken, wrong domain)

**Also useful when:**
- Subdomain is ambiguous (e.g., "ct", "eagles", "wildcats")
- Want to verify before trusting subdomain name
- High-value org worth the $0.02 investment

The backlinks data gives you better starting information for all subsequent steps.

**API Call:**
```bash
curl -s -X POST "https://api.dataforseo.com/v3/backlinks/backlinks/live" \
  -H "Authorization: Basic $(echo -n 'adrian@adriancrook.com:636bda309bca47d7' | base64)" \
  -H "Content-Type: application/json" \
  -d '[{
    "target": "https://SUBDOMAIN.typingclub.com/",
    "limit": 10,
    "backlinks_status_type": "live",
    "include_subdomains": true,
    "exclude_internal_backlinks": true
  }]'
```

**Interpret results:**
- Look at `items[].domain_from` — which websites link to this subdomain?
- Filter for quality: `backlink_spam_score < 50`, `domain_from_rank > 10`
- Prioritize domains with: school, edu, k12, isd, district

**Cost:** $0.02 per check, ~12% success rate

**If website found, save it:**
```bash
curl -X PATCH "https://edclub-explorer-production.up.railway.app/api/domains/SUBDOMAIN" \
  -H "Content-Type: application/json" \
  -d '{"website": "https://found-school-website.edu"}'
```

---

## Step 1: Gather Clues

Collect all available information about the subdomain:

| Source | Example | What it tells you |
|--------|---------|-------------------|
| **Subdomain** | `tustin` | Often the district/school name |
| **Display name** | "CT" or "Lincoln Park Public Schools" | May be abbreviated or full name |
| **Existing location** | State: CA | Narrows NCES search |
| **Existing link** | https://tustin.k12.ca.us | Confirms school identity |
| **Backlinks result** | domain_from: lincolnpark.k12.mi.us | Discovered school website |
| **User count** | 43,357 | May hint at district size (but unreliable) |

**Red flags to watch for:**
- State = "IN" (Indiana is the default/error state for many records)
- Enrollment seems way too high for the apparent school name
- Display name doesn't match subdomain at all
- Generic subdomain (numbers, common words)

**Skip these generic subdomains entirely:**
- `apps`, `api`, `www`, `test`, `demo`, `admin`, `portal`, `login`, `staging`, `dev`
- These are internal/system subdomains, not school accounts
- Do NOT apply any NCES or location data to them

---

## Step 2: Infer School/District Identity

Based on clues, determine:
1. **What is the actual school/district name?**
2. **What state is it in?**
3. **Is this a district or individual school?**

**Examples:**

| Clues | Inference |
|-------|-----------|
| subdomain: `tustin`, state: CA | Tustin Unified School District, CA |
| subdomain: `lpschools`, name: "Lincoln Park Public Schools" | Lincoln Park SD, MI |
| subdomain: `bayvillageschools`, state: IN | Probably wrong state — search "Bay Village Schools" → OH |
| subdomain: `eagles`, state: OR, backlink: `eaglepoint.k12.or.us` | Eagle Point SD, OR |

**Common patterns:**
- `*isd` → Independent School District (Texas)
- `*usd` → Unified School District (California)
- `*ps` or `*schools` → Public Schools
- `k12.*` links → Definitely a K-12 district

---

## Step 3: Search NCES API

Search the National Center for Education Statistics database for the school/district.

**API Call:**
```bash
curl -s "https://edclub-explorer-production.up.railway.app/api/nces/search?name=DISTRICT_NAME&state=XX"
```

**Examples:**
```bash
# Tustin in California
curl -s "https://edclub-explorer-production.up.railway.app/api/nces/search?name=tustin&state=CA"

# Lincoln Park in Michigan
curl -s "https://edclub-explorer-production.up.railway.app/api/nces/search?name=lincoln+park&state=MI"

# Bay Village in Ohio (after correcting wrong state)
curl -s "https://edclub-explorer-production.up.railway.app/api/nces/search?name=bay+village&state=OH"
```

**Response:**
```json
{
  "query": "tustin",
  "state": "CA",
  "resultsCount": 1,
  "results": [
    {
      "name": "Tustin Unified",
      "state": "CA",
      "ncesId": "0640150",
      "enrollment": 21342,
      "estimatedValue": 106710
    }
  ]
}
```

**Tips:**
- NCES only has district-level data, not individual schools
- If searching for a school, try the district name instead
- If no results, try variations (with/without "unified", "public", etc.)
- If multiple results, pick the one matching your location clues

**⚠️ CRITICAL: District vs School**

NCES returns DISTRICT enrollment. Do NOT apply it to individual schools!

| Subdomain Type | Apply NCES? | Example |
|----------------|-------------|---------|
| District (tustin, lpschools) | ✅ YES | Tustin USD → 21K students |
| Individual school (poolesville-elementary123) | ❌ NO | Don't apply 159K district enrollment to one elementary |

**How to tell:**
- Contains "elementary", "middle", "high", "academy" → probably a SCHOOL
- Contains "usd", "isd", "district", "schools", "ps" → probably a DISTRICT
- Subdomain has numbers (poolesville123) → probably a SCHOOL/classroom

**⚠️ CHECK THE NAME FIELD BEFORE APPLYING NCES**

Subdomain names can be misleading! The `school_name` field (scraped from login page) tells the truth.

Example:
- `nmcusd` subdomain looks like "North Monterey County USD" (district)
- But `school_name` says "North Monterey County **Middle School**" (one school!)
- Would have wrongly applied 4,290 district enrollment to a ~600 student middle school

**Before applying NCES enrollment:**
1. Check the `school_name` field — it matches what the login page shows
2. If name contains "Elementary", "Middle School", "High School" → do NOT apply district NCES
3. Ignore garbage names like "Search for Public Schools" — those need manual research

---

## Step 4: Apply the Data

### Option A: Apply NCES Match (Preferred)

If you found an NCES match, apply it to get enrollment + estimated value automatically:

```bash
curl -X POST "https://edclub-explorer-production.up.railway.app/api/domains/SUBDOMAIN/nces" \
  -H "Content-Type: application/json" \
  -d '{"ncesId": "0640150"}'
```

**Response:**
```json
{
  "success": true,
  "subdomain": "tustin",
  "ncesData": {
    "name": "Tustin Unified",
    "state": "CA",
    "ncesId": "0640150",
    "enrollment": 21342,
    "estimatedValue": 106710
  },
  "updated": {
    "nces_id": "0640150",
    "enrollment": 21342,
    "estimated_contract_value": 106710,
    "state": "CA",
    "matched": true
  }
}
```

### Option B: Manual Update (Fallback)

If no NCES match but you know the city/state:

```bash
curl -X PATCH "https://edclub-explorer-production.up.railway.app/api/domains/SUBDOMAIN" \
  -H "Content-Type: application/json" \
  -d '{"city": "Tustin", "state": "CA"}'
```

**Available fields:**
- `city` — City name
- `state` — Two-letter state code
- `website` — School website URL
- `classification` — "district", "school", "teacher", etc.

---

## Decision Tree

```
START
  │
  ├─ Does the record have a URL/link?
  │   └─ NO → Step 0: Run backlinks API first
  │   └─ YES → Does the URL look suspicious? (generic, broken, wrong domain)
  │       └─ YES → Step 0: Run backlinks API first
  │       └─ NO → Continue to Step 1
  │
  ├─ Step 0 results: Did backlinks find a school website?
  │   └─ YES → Save it via PATCH, use it as primary clue
  │   └─ NO → Continue with other clues
  │
  ├─ Step 1-2: Gather clues, infer identity
  │
  ├─ Does state look wrong? (IN is often wrong)
  │   └─ YES → Search NCES without state filter, or web search to find correct state
  │
  ├─ Step 3: Search NCES API
  │   └─ FOUND → Step 4A: Apply NCES match
  │   └─ NOT FOUND → Step 4B: Manual city/state update
  │
  └─ Log the update
```

---

## Common Wrong States

These states are often incorrect (default values or data errors):

| Tagged As | Often Actually |
|-----------|----------------|
| IN (Indiana) | Various — most common error state |
| CA | Sometimes AZ, NV for border cities |
| TX | Sometimes AZ, NM for border cities |
| OR | Sometimes WA for Portland-area |

**When you see IN:** Always verify — search without state filter first.

---

## API Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/data` | GET | List all domains |
| `/api/nces/search?name=X&state=XX` | GET | Search NCES database |
| `/api/domains/:subdomain/nces` | POST | Apply NCES data (enrollment + ID) |
| `/api/domains/:subdomain` | PATCH | Manual field updates |
| DataForSEO Backlinks | POST | Find school websites via backlinks |

---

## Cost Summary

| Action | Cost | Notes |
|--------|------|-------|
| NCES Search | Free | Use liberally |
| NCES Apply | Free | Use liberally |
| Manual PATCH | Free | Use liberally |
| Backlinks API | $0.02 | Use selectively (~12% hit rate) |

---

## Logging

Track all updates in `/root/clawd/edclub-nces-enrichment.md`:

```markdown
| Subdomain | School | NCES ID | Enrollment | City | Notes |
|-----------|--------|---------|------------|------|-------|
| tustin | Tustin Unified | 0640150 | 21,342 | Tustin, CA | Fixed from wrong enrollment |
| lpschools | Lincoln Park SD | 2621600 | 4,895 | Lincoln Park, MI | |
| bayvillageschools | Bay Village City SD | 3901890 | 2,100 | Bay Village, OH | Fixed state IN→OH |
```

---

*Last updated: 2026-02-05*
