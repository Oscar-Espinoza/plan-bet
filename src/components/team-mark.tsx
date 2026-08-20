import type { Team } from "@/lib/contracts";
import { cn } from "@/lib/utils";

/** The mark's own background, from `.team-mark` in globals.css. */
export const MARK_BACKGROUND = "#0d131a";

/**
 * Club colours in `src/lib/seed.ts` are canonical data and stay untouched, but
 * two of them are too dark for the mark's own background to render the visible
 * initials at AA: Barcelona's `#a8274c` is 2.72:1 and Boston's `#d24851` is
 * 4.25:1. Each maps to the same hue lightened just past 4.5:1.
 *
 * `team-mark.test.tsx` recomputes the ratio for every configured team, so a
 * changed club colour fails the suite instead of silently regressing.
 */
const ACCESSIBLE_MARK_COLORS: Record<string, string> = {
  "#a8274c": "#d54b73", // 4.52:1
  "#d24851": "#d45059", // 4.52:1
};

export function markTextColor(primary: string) {
  return ACCESSIBLE_MARK_COLORS[primary.toLowerCase()] ?? primary;
}

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
      style={{
        borderColor: team.colors.primary,
        color: markTextColor(team.colors.primary),
      }}
    >
      {team.mark}
    </span>
  );
}
