import { readFileSync } from "node:fs";
const input = JSON.parse(readFileSync(0, "utf8"));
const cmd = String(input.command ?? input.tool_input?.command ?? "");
const preview = /--env[ =]preview|matchday-preview/.test(cmd);
const has = (re) => re.test(cmd);
const rules = [
  [() => has(/\bwrangler\b[^\n]*\bdeploy\b/) && !has(/--env[ =]preview/), "Deploys must use --env preview; production deploys are Oscar's."],
  [() => has(/\bwrangler\b[^\n]*\b(d1\s+(execute|migrations\s+apply)|kv\b[^\n]*\b(put|delete))\b/) && has(/--remote/) && !preview, "Remote D1/KV writes are allowed only on the preview resources."],
  [() => has(/\bwrangler\b[^\n]*\bsecret\s+(put|delete|bulk)\b/) && !has(/--env[ =]preview/), "Secrets outside --env preview are Oscar's."],
  [() => has(/matchday-prod/), "Production resources are Oscar's."],
  [() => has(/DATABASE_URL=|(^|[\s;&|(])(psql|pg_dump)(\s|$)|(^|[\s;&|(])((npx|bunx)\s+|pnpm\s+(dlx|exec)\s+)?vercel(\s|$)/), "Neon and Vercel CLIs are Oscar's (export runs by hand in T14/T15). Plain HTTPS requests to plan-bet.vercel.app are fine."],
  [() => has(/drizzle-kit\s+(push|migrate)/), "Only drizzle-kit generate; apply with wrangler d1 migrations apply."],
  [() => has(/\bgit\s+push\b[^\n]*(--force|\s-f\b|\bmain\b)/), "No force pushes and no pushes to main or cf/main."],
  [() => has(/\bgit\s+(reset\s+--hard|clean\s+-\w*f)/), "Destructive git commands are not allowed."],
  [() => has(/\brm\s+-\w*r\w*\s+(\/|~|\.\.)/), "rm -r outside the worktree is not allowed."],
];
const hit = rules.find(([test]) => test());
process.stdout.write(JSON.stringify(hit
  ? { permission: "deny", user_message: `Blocked: ${hit[1]}`, agent_message: `Blocked by migration guard: ${hit[1]} Record it in docs/migration-log.md if Oscar must do it.` }
  : { permission: "allow" }) + "\n");
