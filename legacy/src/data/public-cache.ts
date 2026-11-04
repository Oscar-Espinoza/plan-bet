import "server-only";
import { revalidateTag } from "next/cache";

export const SPORTS_TAG = "public-sports-v2";
export const DASHBOARD_TAG = "dashboard";

// CLI jobs have no Next request context; the 30s TTL bounds their cache lag.
export function invalidatePublicSports() {
  try {
    revalidateTag(SPORTS_TAG, "max");
    revalidateTag(DASHBOARD_TAG, "max");
  } catch {
    // Scheduled Next routes invalidate immediately; CLI writes expire by TTL.
  }
}
