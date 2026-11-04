import { env } from "cloudflare:workers";

export const MAINTENANCE_MESSAGE =
  "Matchday Plan is in maintenance. You can still browse; sign-in and other changes are paused.";

export function maintenanceEnabled(): boolean {
  try {
    if (String(env.MATCHDAY_MAINTENANCE) === "1") return true;
  } catch {
    // Outside the worker.
  }
  return process.env.MATCHDAY_MAINTENANCE === "1";
}
