# Data migration

Three scripts move Matchday Plan from Neon (Auth.js, Postgres) to D1 (Better Auth, SQLite). Output lands in `migration-out/`, which is gitignored.

`export-neon.ts` against production is run by Oscar or the coordinator, never by a builder.

## Scripts

```bash
pnpm migrate:export -- --url-env DATABASE_URL --env-file <path-to-env>
pnpm migrate:transform -- --source migration-out
pnpm migrate:reconcile -- --source migration-out --d1 local
```

`export` opens one `REPEATABLE READ READ ONLY` transaction and writes one NDJSON file per table plus `manifest.json`. It does not write to the source.

`transform` writes `import.sql` and `manifest-transform.json`. The SQL starts with `PRAGMA defer_foreign_keys = true;`, drops `user_starting_grant` before the user rows, and appends the `CREATE TRIGGER` statement byte-identical to `drizzle/0001_starting_grant_trigger.sql`. Sessions and verification tokens are not migrated. A user with no email is skipped; the transform exits 1 if that user owns wagers, ledger rows, or any other required foreign key.

`provider_cache` is a TTL cache. The enrichment job refetches it, and legacy fixture-context reads it with an expiry. A cache row whose single-row INSERT would be 100 KB or larger is skipped, not fatal. Each skip is a `WARN` line and an entry in `manifest-transform.json` `skippedRows` (`table`, `key` as `provider/kind/scope`, and `bytes`). An oversized row in any other table still stops the transform. Reconcile expects `source − skipped` for those documented skips.

`reconcile --d1` is `local` (`wrangler d1 execute DB --local --env preview`), `preview` (`--remote --env preview`), or `prod`. Prod is refused unless `MP_RECONCILE_PROD=1`. Prod reads the top-level `DB` binding and does not pass `--env preview`.

## Production cutover (spec §7; Oscar runs these)

Prerequisites in the spec: maintenance is on, the Vercel redirect is live, and production D1 migrations are applied to an empty database.

```bash
pnpm migrate:export -- --url-env DATABASE_URL --env-file <production-env>
pnpm migrate:transform -- --source migration-out
wrangler d1 execute matchday-prod --remote --file migration-out/import.sql
MP_RECONCILE_PROD=1 pnpm migrate:reconcile -- --source migration-out --d1 prod
```

The reconcile line prints `RECONCILE OK users=<n> tables=<n>` only when every migrated user matches (balance, wager count, open wagers, stake sum, return sum), every table count matches after the documented skips, and `scripts/verify/ledger-invariants.sql` returns no rows.

## Local rehearsal

The legacy seed uses the Neon serverless driver, which speaks WebSockets and cannot reach a Docker Postgres. `neon-local-preload.mjs` swaps that driver for `pg` so `pnpm --dir legacy test:seed` can load the fixture. Point it only at the throwaway container.

```bash
docker run --rm -d --name t14-pg \
  -e POSTGRES_USER=t14 -e POSTGRES_PASSWORD=t14 -e POSTGRES_DB=t14 \
  -p 55432:5432 postgres:16-alpine
```

Write `legacy/.env.local` with the local connection string (do not commit it), then:

```bash
pnpm --dir legacy db:migrate
NODE_OPTIONS="--import $(pwd)/scripts/migrate/neon-local-preload.mjs" \
  pnpm --dir legacy test:seed t14-a@rehearsal.invalid
NODE_OPTIONS="--import $(pwd)/scripts/migrate/neon-local-preload.mjs" \
  pnpm --dir legacy test:seed t14-b@rehearsal.invalid
node --experimental-strip-types scripts/migrate/rehearsal-edges.ts \
  --url-env DATABASE_URL --env-file legacy/.env.local
pnpm migrate:export -- --url-env DATABASE_URL --env-file legacy/.env.local
pnpm migrate:transform
rm -rf .wrangler/state
pnpm db:migrate:local
pnpm exec wrangler d1 execute DB --local --env preview --file migration-out/import.sql
pnpm migrate:reconcile -- --source migration-out --d1 local
```

Stop the container when finished: `docker stop t14-pg`.
