import { cn } from "@/lib/utils";

export function StatusTag({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "positive" | "warning";
  className?: string;
}) {
  return (
    <span className={cn("status-tag", `status-${tone}`, className)}>
      {children}
    </span>
  );
}
