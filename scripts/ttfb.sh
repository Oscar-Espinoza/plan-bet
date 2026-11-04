#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "usage: scripts/ttfb.sh <url> [cookie]" >&2
  exit 1
fi

url=$1
cookie=${2-}
times=()

for _ in 1 2 3 4 5 6 7 8 9 10; do
  if [[ -n $cookie ]]; then
    elapsed=$(curl -sS -o /dev/null -w '%{time_starttransfer}' -H "Cookie: ${cookie}" "$url")
  else
    elapsed=$(curl -sS -o /dev/null -w '%{time_starttransfer}' "$url")
  fi
  printf '%s\n' "$elapsed"
  times+=("$elapsed")
done

median=$(
  printf '%s\n' "${times[@]}" | sort -n | awk '
    { a[NR] = $1 }
    END {
      if (NR == 0) exit 1
      if (NR % 2 == 1) printf "%.6f", a[(NR + 1) / 2]
      else printf "%.6f", (a[NR / 2] + a[NR / 2 + 1]) / 2
    }
  '
)

printf 'median %s\n' "$median"
