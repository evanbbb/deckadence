#!/bin/bash
# Upload image files into the Figma placeholders created by the build scripts.
#
# Usage: upload.sh <workDir> <pairsFile>
#   pairsFile: one line per upload: "<submitUrl> <relative/file/path>"
#   submitUrl = each "submitUrl" returned by the Figma MCP tool upload_assets (called with nodeIds = the placeholder
#   ids, in the same order as the files). URLs are single-use and expire after ~10 minutes, so run this right away.
# Prints one line per file with success / error. Uploads 8 at a time.
W=$1; P=$2
[ -f "$P" ] || { echo "pairs file not found: $P"; exit 1; }
while read -r url file; do
  [ -z "$url" ] && continue
  ct=image/png
  case "$file" in *.gif) ct=image/gif;; *.jpg|*.jpeg) ct=image/jpeg;; *.webp) ct=image/webp;; *.svg) ct=image/svg+xml;; esac
  ( r=$(curl -s -X POST -F "file=@$W/$file;type=$ct" "$url"); echo "$file -> $(echo "$r" | grep -oE '"(success|placedOnNodeId|contentType|error)":[^,}]*' | tr '\n' ' ')" ) &
  while [ "$(jobs -r | wc -l)" -ge 8 ]; do sleep 0.3; done
done < "$P"
wait
