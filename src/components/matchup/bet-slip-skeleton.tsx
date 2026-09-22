"use client";

import { Ticket } from "lucide-react";
import { useTranslation } from "@/components/language-provider";
import type { Sport } from "@/lib/contracts";
import { inMarketCategory, marketsFor, namedSelection } from "@/lib/markets";
import { Button } from "@/components/ui/button";

function Placeholder({ children }: { children: React.ReactNode }) {
  return <span className="match-placeholder">{children}</span>;
}

/** Uses the real card/grid classes, with no prices, balance or usable controls. */
export function BetSlipSkeleton({
  sport = "soccer",
  finished = false,
  matchup,
}: {
  sport?: Sport;
  finished?: boolean;
  matchup?: { home: string; away: string };
}) {
  const { t } = useTranslation();
  return (
    <aside
      className="mp-action"
      role="status"
      aria-label={t("Loading…")}
      aria-busy="true"
    >
      <section className="panel wager-panel" aria-hidden="true">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">
              {!finished && <Ticket className="bet-ticket-icon" />}
              <span>{t(finished ? "Your match results" : "Make a bet")}</span>
            </h2>
            <p className="panel-purpose">
              {t(
                finished
                  ? "Your bets and returns for this match."
                  : "Simulate a bet on this match with fictional credits.",
              )}
            </p>
          </div>
          {!finished && (
            <span className="bet-balance">
              <small>{t("Balance")}</small>
              <Placeholder>0,000</Placeholder>
            </span>
          )}
        </div>
        {!finished && (
          <div className="selection-grid">
            <div className="market-filters">
              {["Popular", sport === "soccer" ? "Goals" : "Runs", "Teams"].map(
                (label, i) => (
                  <button
                    disabled
                    type="button"
                    aria-pressed={i === 0}
                    key={label}
                  >
                    {t(label)}
                  </button>
                ),
              )}
            </div>
            {marketsFor(sport)
              .filter((market) => inMarketCategory(market, "popular"))
              .map((market) => (
                <div className="selection-market" key={market.id}>
                  <h3 className="field-label">
                    <Placeholder>{t(market.label)}</Placeholder>
                  </h3>
                  {market.kind === "exact_score" ? (
                    <div className="mp-score">
                      <label className="mp-score-team">
                        <span>{matchup?.home ?? t("Home")}</span>
                        <input
                          disabled
                          readOnly
                          type="number"
                          value=""
                          className="match-placeholder"
                        />
                      </label>
                      <span className="mp-score-dash">–</span>
                      <label className="mp-score-team">
                        <span>{matchup?.away ?? t("Away")}</span>
                        <input
                          disabled
                          readOnly
                          type="number"
                          value=""
                          className="match-placeholder"
                        />
                      </label>
                      <p className="mp-score-price">
                        <Placeholder>{t("Type a score")}</Placeholder>
                      </p>
                    </div>
                  ) : (
                    <div className="selection-row">
                      {market.selections.map((selection) => (
                        <div className="selection-button" key={selection.id}>
                          <Placeholder>
                            {t(namedSelection(market, selection, matchup))}
                          </Placeholder>
                          <Placeholder>0.00</Placeholder>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            <p className="bet-hint">
              <Placeholder>
                {t("Nothing picked yet — tap any price above to set a stake.")}
              </Placeholder>
            </p>
          </div>
        )}
        {!finished && (
          <>
            <Button type="button" className="w-full" disabled>
              <Placeholder>{t("Choose a selection")}</Placeholder>
            </Button>
            <span className="action-bar-label">{t("Returns")}</span>
            <span className="return-figure">
              <Placeholder>—</Placeholder>
            </span>
            <div className="wager-feedback" />
          </>
        )}
      </section>
    </aside>
  );
}
