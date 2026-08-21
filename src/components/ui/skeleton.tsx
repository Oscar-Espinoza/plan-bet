export function Skeleton({
  label,
  count = 2,
}: {
  label: string;
  count?: number;
}) {
  return (
    <div className="section-grid" role="status" aria-label={label}>
      {Array.from({ length: count }).map((_, index) => (
        <div className="panel loading-panel" key={index} />
      ))}
    </div>
  );
}
