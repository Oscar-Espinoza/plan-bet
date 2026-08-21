import { cn } from "@/lib/utils";

export function Card({
  title,
  titleId,
  headerExtra,
  children,
  className,
}: {
  title: React.ReactNode;
  titleId: string;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("panel", className)} aria-labelledby={titleId}>
      <div className="panel-header">
        <h2 className="panel-title" id={titleId}>
          {title}
        </h2>
        {headerExtra}
      </div>
      {children}
    </section>
  );
}
