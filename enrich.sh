#!/bin/bash
# EdClub Customer Enrichment Script

INPUT="/root/clawd/memory/projects/edclub-customers-names.txt"
OUTPUT="/root/clawd/projects/edclub-explorer/enriched-data.json"
PROGRESS="/root/clawd/projects/edclub-explorer/progress.txt"

# Initialize JSON array if file doesn't exist
if [ ! -f "$OUTPUT" ]; then
    echo "[]" > "$OUTPUT"
fi

# Get already processed subdomains
processed=$(cat "$OUTPUT" | grep -o '"subdomain": "[^"]*"' | cut -d'"' -f4 | sort -u)

count=0
total=$(wc -l < "$INPUT")

while IFS= read -r subdomain; do
    # Skip empty lines and already processed
    [ -z "$subdomain" ] && continue
    echo "$processed" | grep -q "^${subdomain}$" && continue
    
    url="https://${subdomain}.typingclub.com"
    
    # Fetch the page and extract h1
    html=$(curl -s -L --max-time 10 "$url" 2>/dev/null)
    schoolName=$(echo "$html" | grep -oP '<h1[^>]*>\K[^<]+' | head -1 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    
    if [ -z "$schoolName" ]; then
        schoolName=""
    fi
    
    # Escape special characters for JSON
    schoolName=$(echo "$schoolName" | sed 's/\\/\\\\/g; s/"/\\"/g')
    
    # Add to JSON file
    tmp=$(mktemp)
    if [ "$(cat "$OUTPUT")" = "[]" ]; then
        echo "[{\"subdomain\": \"$subdomain\", \"schoolName\": \"$schoolName\", \"url\": \"$url\"}]" > "$tmp"
    else
        # Remove closing bracket, add comma and new entry
        sed '$ s/]$//' "$OUTPUT" > "$tmp"
        echo ",{\"subdomain\": \"$subdomain\", \"schoolName\": \"$schoolName\", \"url\": \"$url\"}]" >> "$tmp"
    fi
    mv "$tmp" "$OUTPUT"
    
    count=$((count + 1))
    echo "$count: $subdomain -> $schoolName"
    
done < "$INPUT"

echo "Done! Processed $count subdomains"
