#!/usr/bin/env bash
# Re-encode the bundled football crests at 160×160. They render at 22–62 CSS px,
# so 160 covers a 2.5x screen at the largest size; the 500×500 originals were
# up to 233 KB each. Pass the files to convert (default: all of them); re-running
# on an already converted crest re-encodes it lossily, so only pass new ones.
set -euo pipefail
dir="$(dirname "$0")/../public/team-logos/football"
[ $# -gt 0 ] || set -- "$dir"/*.webp
for file in "$@"; do
  cwebp -quiet -resize 160 160 -q 82 -m 6 -alpha_q 90 "$file" -o "$file.tmp"
  mv "$file.tmp" "$file"
done
