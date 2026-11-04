"use client";
import { useTranslation } from "@/components/language-provider";
import { CircleDot } from "lucide-react";
import { LocalDateTime } from "@/components/local-date-time";
import type { Freshness } from "@/lib/contracts";

export function DemoStamp({
  compact = false,
  freshness,
}: {
  compact?: boolean;
  freshness: Freshness;
}) {
  const { t } = useTranslation();
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
      title={t("Fetched {p0}", { p0: freshness.fetchedAt })}
    >
      <CircleDot aria-hidden="true" size={12} />
      <span>{t(label)}</span>
      {!compact && (
        <span>
          · <LocalDateTime value={freshness.fetchedAt} short />
        </span>
      )}
    </div>
  );
}
