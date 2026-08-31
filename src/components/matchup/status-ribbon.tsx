import type { MatchView } from "@/lib/game-view";

/**
 * Shown only when the game is not simply waiting to start. A scheduled game
 * says nothing here — the countdown above already says it, louder.
 */
const RIBBON: Partial<Record<MatchView["timing"]["status"], string>> = {
  live: "Underway",
  finished: "Full time",
  postponed: "Postponed",
  cancelled: "Cancelled",
};

export function StatusRibbon({
  status,
}: {
  status: MatchView["timing"]["status"];
}) {
  const label = RIBBON[status];
  if (!label) return null;
  return (
    <p className="mp-ribbon" data-status={status}>
      {label}
    </p>
  );
}
