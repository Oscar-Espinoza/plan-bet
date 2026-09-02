const LIST_ROWS = 5;
const RECORD_ROWS = 4;

/**
 * Two shapes cover the routes on the scoreboard system: a list of rows (the
 * slate, groups) or a stat panel above a wide table (You, a group, System).
 * Reuses .loading-panel's pulse and .section-grid rather than inventing new
 * structural classes. The matchup page has its own, in its own language.
 */
export function Skeleton({
  label,
  variant,
  panelCount = 2,
}: {
  label: string;
  variant: "list" | "record";
  /** Number of .section-grid panels to render — must match the real page's
      card count, or the loading state flashes a different column count
      than the content that replaces it. Defaults to 2 (groups/[slug]). */
  panelCount?: number;
}) {
  if (variant === "record") {
    return (
      <div className="section-grid" role="status" aria-label={label}>
        <div className="panel loading-panel skeleton-rows">
          {Array.from({ length: RECORD_ROWS }).map((_, index) => (
            <div className="skeleton-bar" key={index} />
          ))}
        </div>
        {Array.from({ length: panelCount - 1 }).map((_, index) => (
          <div className="panel loading-panel" key={index} />
        ))}
      </div>
    );
  }

  return (
    <div className="section-grid" role="status" aria-label={label}>
      <div className="panel loading-panel skeleton-rows">
        <div className="skeleton-bar skeleton-bar-header" />
        {Array.from({ length: LIST_ROWS }).map((_, index) => (
          <div className="skeleton-bar skeleton-bar-row" key={index} />
        ))}
      </div>
    </div>
  );
}
