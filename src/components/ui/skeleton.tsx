const LIST_ROWS = 5;
const RECORD_ROWS = 4;

/**
 * Three shapes cover every route's loading.tsx: a list of rows (the slate,
 * groups), a stat panel above a wide table (You, a group, System), or a
 * wide/narrow pair matching the game page's .detail-layout. Reuses
 * .loading-panel's pulse and .section-grid / .detail-layout rather than
 * inventing new structural classes.
 */
export function Skeleton({
  label,
  variant,
}: {
  label: string;
  variant: "list" | "record" | "detail";
}) {
  if (variant === "detail") {
    return (
      <div className="detail-layout" role="status" aria-label={label}>
        <div className="detail-primary panel loading-panel" />
        <div className="detail-side panel loading-panel" />
      </div>
    );
  }

  if (variant === "record") {
    return (
      <div className="section-grid" role="status" aria-label={label}>
        <div className="panel loading-panel skeleton-rows">
          {Array.from({ length: RECORD_ROWS }).map((_, index) => (
            <div className="skeleton-bar" key={index} />
          ))}
        </div>
        <div className="panel loading-panel" />
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
