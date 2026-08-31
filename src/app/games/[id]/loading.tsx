/**
 * Shaped like the page it precedes: the scorebug's block, then the two
 * columns. Inline rather than a Skeleton variant, because this is the only
 * route on the new language and a shared variant would have to straddle both.
 */
export default function GameLoading() {
  return (
    <div className="mp" role="status" aria-label="Loading game">
      <div className="mp-skeleton mp-skeleton-bug" />
      <div className="mp-layout">
        <div className="mp-skeleton mp-skeleton-action" />
        <div className="mp-skeleton mp-skeleton-read" />
      </div>
    </div>
  );
}
