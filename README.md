# EdClub Competitor Intel

3,613 schools/districts using TypingClub/EdClub — identified via DNS enumeration + CommonCrawl.

## Architecture

```
Supabase (Database)
├── domains table (3613 records)
├── validation status
└── wayback enrichment data

Railway (Compute)
└── Worker service (runs continuously)
    ├── Domain validation (~50/min)
    └── Wayback enrichment (~30/min)
```

## Setup

### 1. Supabase
1. Create project at supabase.com
2. Run `src/schema.sql` in SQL editor
3. Copy project URL and anon key

### 2. Railway
1. Create project at railway.app
2. Connect this GitHub repo
3. Add environment variables:
   - `SUPABASE_URL` = your project URL
   - `SUPABASE_KEY` = your anon/service key

### 3. Migrate existing data
```bash
SUPABASE_URL=... SUPABASE_KEY=... npm run migrate
```

### 4. Deploy
Railway auto-deploys on push. Worker runs until all 3613 domains are enriched.

## Data Sources

- **CommonCrawl**: Mining `*.typingclub.com` and `*.edclub.com` subdomains
- **Wayback Machine**: First/last seen dates for customer tenure
- **DNS validation**: Check if subdomains still resolve

## Dashboard

Static dashboard at `index.html` — deploy to Railway or Vercel for live view.

## Local Development

```bash
npm install
SUPABASE_URL=... SUPABASE_KEY=... npm run dev
```
