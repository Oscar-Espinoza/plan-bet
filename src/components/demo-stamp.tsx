import { CircleDot } from "lucide-react";
import { LocalDateTime } from "@/components/local-date-time";
import type { Freshness } from "@/lib/contracts";
import { demoGeneratedAt } from "@/lib/seed";

const defaultFreshness: Freshness = {
  mode: "demo",
  provider: "demo",
  sourceObservedAt: demoGeneratedAt,
  fetchedAt: demoGeneratedAt,
  attribution: {
    name: "Matchday Plan demo data",
    url: "https://plan-bet.vercel.app",
  },
};

export function DemoStamp({
  compact = false,
  freshness = defaultFreshness,
}: {
  compact?: boolean;
  freshness?: Freshness;
}) {
  const label =
    freshness.mode === "live"
      ? "Live provider data"
      : freshness.mode === "stale"
        ? "Stale live data"
        : "Demo snapshot";
  return (
    <div
      className="demo-stamp"
      data-mode={freshness.mode}
      title={`Fetched ${freshness.fetchedAt}`}
    >
      <CircleDot aria-hidden="true" size={12} />
      <span>{label}</span>
      {!compact && (
        <span>
          · <LocalDateTime value={freshness.fetchedAt} short />
        </span>
      )}
    </div>
  );
}
