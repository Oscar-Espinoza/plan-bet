# Review context: Matchday Plan Cloudflare migration
This branch ports a Next.js app (kept read-only in legacy/) to SvelteKit 3 on Cloudflare Workers with D1. The spec is docs/cloudflare-migration-spec.md.

Flag as bugs:
- Any UPDATE/DELETE on wagers or credit_entries; a stored balance; a placement/reset/accept/quota rule checked by a read before the write batch instead of a predicate inside it.
- Settlement that can pay twice, grades a non-terminal game, or uses anything but gradeSelection on the stored result.
- Client-supplied prices or potential returns being trusted.
- A response that can enter the edge cache while a session cookie is present or while it sets a cookie; `no-store` on HTML.
- Provider calls on the request path; a failed refresh overwriting last-known-good; invented values where data is missing.
- zod, server modules, or secrets reachable from client code.
- SvelteKit 2 APIs ($lib, $app/stores, $app/environment, svelte.config.js) — the project is on SvelteKit 3.
- Buddy: an OpenAI call without a successful quota claim; an unresolved [fact-id] not retracting the reply.

Do not flag: files under legacy/; behaviour assigned to a later ticket in spec §5; duplication that causes no defect; formatting.
