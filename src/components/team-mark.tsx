import type { Team } from "@/lib/contracts";
import { cn } from "@/lib/utils";

export function TeamMark({
  team,
  size = "md",
  className,
}: {
  team: Team;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "team-mark",
        size === "sm" && "team-mark-sm",
        size === "lg" && "team-mark-lg",
        className,
      )}
      style={{ borderColor: team.colors.primary, color: team.colors.primary }}
    >
      {team.mark}
    </span>
  );
}
