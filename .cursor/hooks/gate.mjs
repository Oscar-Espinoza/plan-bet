import { readFileSync } from "node:fs";
import { execSync, spawnSync } from "node:child_process";
const input = JSON.parse(readFileSync(0, "utf8"));
if (input.status !== "completed") { process.stdout.write("{}\n"); process.exit(0); }
const changed = execSync("git status --porcelain -- src workers drizzle scripts static vite.config.ts wrangler.jsonc package.json", { encoding: "utf8" }).trim();
if (!changed) { process.stdout.write("{}\n"); process.exit(0); }
const run = spawnSync("pnpm", ["-s", "check"], { encoding: "utf8", timeout: 600_000 });
const out = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
const ok = run.status === 0 && /CHECK OK [0-9a-f]{7,}/.test(out);
const tail = out.trim().split("\n").slice(-60).join("\n");
process.stdout.write(JSON.stringify(ok ? {} : {
  followup_message: `The gate (pnpm check) did not print CHECK OK. Fix the cause, then finish again. Last output:\n${tail}`,
}) + "\n");
