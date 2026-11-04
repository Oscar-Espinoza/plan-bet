"use client";

import { useTranslation } from "@/components/language-provider";
import { Scorebug } from "@/components/matchup/scorebug";
import type { MatchView } from "@/lib/game-view";

export type MatchTab = "overview" | "stats" | "lineups" | "h2h";
export type MatchHeaderView = Pick<MatchView, "identity" | "timing">;

const TABS: { id: MatchTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "stats", label: "Stats" },
  { id: "lineups", label: "Lineups" },
  { id: "h2h", label: "H2H" },
];

/** One layout for both the first click and the completed match page. */
export function MatchChrome({
  view,
  tab = "overview",
  onTabChange,
}: {
  view?: MatchHeaderView;
  tab?: MatchTab;
  onTabChange?: (tab: MatchTab) => void;
}) {
  const { t } = useTranslation();
  const moveTab = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const direction =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? TABS.length - 1
          : direction
            ? (index + direction + TABS.length) % TABS.length
            : -1;
    if (next < 0 || !onTabChange) return;
    event.preventDefault();
    const target = TABS[next]!;
    onTabChange(target.id);
    requestAnimationFrame(() =>
      document.getElementById(`match-tab-${target.id}`)?.focus(),
    );
  };
  return (
    <>
      <p className="mp-breadcrumb">
        {view ? (
          <>
            <span>
              {t(view.identity.sport === "soccer" ? "Soccer" : "Baseball")}
            </span>
            <span aria-hidden="true">›</span>
            <span>{t(view.identity.competition)}</span>
          </>
        ) : (
          <span className="match-placeholder" aria-hidden="true">
            <span>{t("Match information")}</span>
          </span>
        )}
      </p>
      {view ? (
        <Scorebug {...view} />
      ) : (
        <header className="mp-bug match-header-skeleton" aria-hidden="true">
          <span className="mp-status-pill match-placeholder">
            <span>{t("Upcoming")}</span>
          </span>
          <div className="mp-sides">
            {["Home", "Away"].map((side, index) => (
              <div
                className="mp-side"
                key={side}
                style={{ gridColumn: index ? 3 : 1 }}
              >
                <span className="mp-side-team">
                  <span className="team-logo match-placeholder" />
                  <span className="mp-side-name match-placeholder">
                    <span>{t(side)}</span>
                  </span>
                </span>
              </div>
            ))}
          </div>
          <div className="mp-clock">
            <span className="match-placeholder">
              <span>{t("Kickoff in")} 00d 00h</span>
            </span>
          </div>
          <div className="mp-when">
            <span className="match-placeholder">
              <span>00 / 00 / 0000 · 00:00</span>
            </span>
          </div>
        </header>
      )}
      <div
        className="mp-tabs"
        role={onTabChange ? "tablist" : undefined}
        aria-label={onTabChange ? t("Match information") : undefined}
        aria-hidden={!onTabChange || undefined}
      >
        {TABS.map(({ id, label }, index) => (
          <button
            type="button"
            role="tab"
            key={id}
            id={onTabChange ? `match-tab-${id}` : undefined}
            aria-controls={onTabChange ? `match-panel-${id}` : undefined}
            aria-selected={tab === id}
            tabIndex={onTabChange && tab === id ? 0 : -1}
            disabled={!onTabChange}
            onClick={() => onTabChange?.(id)}
            onKeyDown={(event) => moveTab(event, index)}
          >
            {t(label)}
          </button>
        ))}
      </div>
    </>
  );
}
