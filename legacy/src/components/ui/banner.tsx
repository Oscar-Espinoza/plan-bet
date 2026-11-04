import { cn } from "@/lib/utils";

export function Banner({
  tone = "neutral",
  role = "status",
  className,
  children,
}: {
  tone?: "neutral" | "positive" | "warning" | "negative";
  role?: "status" | "alert";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p role={role} className={cn("banner", `banner-${tone}`, className)}>
      {children}
    </p>
  );
}
