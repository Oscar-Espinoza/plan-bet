#!/usr/bin/env bash
# Production cutover (spec §7). Usage:
#   scripts/migrate/cutover.sh rehearse   # export → wipe prod D1 → import → reconcile. Old site untouched.
#   scripts/migrate/cutover.sh go         # maintenance on → Vercel 308 → final export → wipe → import → reconcile → maintenance off
# Needs: legacy DATABASE_URL in ENV_FILE (default ../plan-bet/.env.local), wrangler login, vercel login,
# the prod CRON_SECRET in CRON_SECRET_FILE.
set -euo pipefail
MODE="${1:?rehearse|go}"
cd "$(dirname "$0")/../.."
ENV_FILE="${ENV_FILE:-../plan-bet/.env.local}"
CRON_SECRET_FILE="${CRON_SECRET_FILE:-../plan-bet-wt/prod-cron-secret}"
SITE=https://matchday.tendo.ar
VERCEL_LINK="${VERCEL_LINK:-../plan-bet/.vercel/project.json}"
step() { printf '\n== %s\n' "$*"; }

if [ "$MODE" = go ]; then
  step "1. Maintenance on"
  pnpm build >/dev/null
  pnpm exec wrangler deploy --var MATCHDAY_MAINTENANCE:1 | grep -E "Deployed|custom domain"
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d '{}' "$SITE/api/bets")
  [ "$code" = 503 ] || { echo "expected 503 from POST /api/bets, got $code"; exit 1; }

  step "2. Vercel 308 redirect"
  R=$(mktemp -d); cp -r scripts/migrate/vercel-redirect/. "$R"/; mkdir -p "$R/.vercel"; cp "$VERCEL_LINK" "$R/.vercel/project.json"
  vercel deploy --prod --yes --cwd "$R" >/dev/null 2>&1 || true  # exits non-zero on its JSON hint output; the curl below is the check
  loc=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' https://plan-bet.vercel.app/rules)
  echo "$loc"; case "$loc" in "308 $SITE/rules") ;; *) echo "redirect check failed"; exit 1;; esac
fi

step "3. Export legacy (read-only)"
rm -rf migration-out
pnpm -s migrate:export -- --url-env DATABASE_URL --env-file "$ENV_FILE"

step "4. Transform"
pnpm -s migrate:transform -- --source migration-out

step "5. Wipe prod D1 data (schema and migrations kept)"
tables=$(pnpm exec wrangler d1 execute matchday-prod --remote --json --command \
  "select name from sqlite_master where type='table' and name not like 'sqlite_%' and name not like '_cf_%' and name <> 'd1_migrations'" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const r=(Array.isArray(j)?j[0]:j).results;console.log(r.map(x=>x.name).join(" "))})')
{ echo "PRAGMA defer_foreign_keys = true;"; for t in $tables; do echo "DELETE FROM \"$t\";"; done; } > migration-out/wipe.sql
pnpm exec wrangler d1 execute matchday-prod --remote --file migration-out/wipe.sql >/dev/null

step "6. Import"
pnpm exec wrangler d1 execute matchday-prod --remote --file migration-out/import.sql >/dev/null

step "7. Reconcile"
MP_RECONCILE_PROD=1 pnpm -s migrate:reconcile -- --source migration-out --d1 prod

if [ "$MODE" = go ]; then
  step "8. Maintenance off"
  pnpm exec wrangler deploy | grep -E "Deployed|custom domain"
fi

step "9. Refresh public read models"
for j in refresh enrich; do
  curl -s -m 150 -o /dev/null -w "$j %{http_code}\n" -H "Authorization: Bearer $(cat "$CRON_SECRET_FILE")" "$SITE/api/cron/$j" || echo "$j timed out"
done
curl -s "$SITE/api/health"; echo
