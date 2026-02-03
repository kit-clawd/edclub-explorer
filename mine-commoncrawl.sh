#!/bin/bash
# CommonCrawl Mining Script for EdClub/TypingClub subdomains
# Runs through all available indexes and adds new customers

cd /root/clawd/projects/edclub-explorer
LOG="commoncrawl-mining.log"

echo "$(date): Starting CommonCrawl mining..." >> $LOG

# Get list of all available indexes
INDEXES=$(curl -s "https://index.commoncrawl.org/collinfo.json" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for idx in data:
    print(idx['id'])
" 2>/dev/null)

INFRA="www support store media static videos analytics registry vcenter st1 admin api help app login test feedback beta target www2 computerlab"

for INDEX in $INDEXES; do
    echo "$(date): Checking $INDEX..." >> $LOG
    
    # Query both domains
    for DOMAIN in edclub.com typingclub.com; do
        curl -s "http://index.commoncrawl.org/${INDEX}-index?url=*.${DOMAIN}/*&output=json&limit=1000" 2>/dev/null
    done | python3 -c "
import json, sys, re

subdomains = set()
infra = set('$INFRA'.split())

for line in sys.stdin:
    try:
        data = json.loads(line)
        url = data.get('url', '')
        for domain in ['edclub.com', 'typingclub.com']:
            match = re.search(rf'https?://([a-z0-9-]+)\.{domain}', url.lower())
            if match:
                sub = match.group(1)
                if sub not in infra and len(sub) > 2:
                    subdomains.add(sub)
    except:
        pass

for s in sorted(subdomains):
    print(s)
" >> /tmp/cc-batch-$$.txt
    
    # Rate limit - be nice to CommonCrawl
    sleep 2
done

# Add new subdomains to data
python3 << 'PYEOF'
import json

with open('enriched-data.json', 'r') as f:
    data = json.load(f)

existing = {d['subdomain'] for d in data}
initial = len(data)

try:
    import glob
    for f in glob.glob('/tmp/cc-batch-*.txt'):
        with open(f, 'r') as fp:
            for line in fp:
                sub = line.strip()
                if sub and sub not in existing:
                    data.append({
                        "subdomain": sub,
                        "schoolName": None,
                        "url": f"https://{sub}.typingclub.com",
                        "source": "commoncrawl"
                    })
                    existing.add(sub)
except Exception as e:
    print(f"Error: {e}")

data.sort(key=lambda x: x['subdomain'])

with open('enriched-data.json', 'w') as f:
    json.dump(data, f, indent=2)

added = len(data) - initial
print(f"Added {added} new subdomains. Total: {len(data)}")
PYEOF

# Cleanup temp files
rm -f /tmp/cc-batch-*.txt

# Commit and push if there are changes
if ! git diff --quiet enriched-data.json; then
    TOTAL=$(cat enriched-data.json | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")
    git add enriched-data.json
    git commit -m "🔄 CommonCrawl mining update (total: $TOTAL)" --quiet
    git push --quiet
    echo "$(date): Pushed updates. Total: $TOTAL" >> $LOG
else
    echo "$(date): No new subdomains found" >> $LOG
fi

echo "$(date): Mining complete" >> $LOG
