"use client";
import { useTranslation } from "@/components/language-provider";
import { NavigationLink as Link } from "@/components/fast-link";
import { ChevronRight, Receipt } from "lucide-react";
import { LocalDateTime } from "@/components/local-date-time";
import { Button } from "@/components/ui/button";
import { StatusTag } from "@/components/ui/status-tag";
import type { Wager, WagerSettlement } from "@/lib/contracts";
import { wagerSelectionLabel } from "@/lib/markets";
import { outcomeTone, settlementLabel } from "@/lib/wager-copy";

/**
 * The score that decided a settled wager. A void was decided by nothing, and
 * a game whose row has since gone carries no score — both read honestly
 * rather than as a fabricated 0-0. An open wager has no score yet.
 */
function decidingResult(settlement: WagerSettlement | undefined) {
  if (!settlement) return undefined;
  if (settlement.outcome === "void") return "Voided";
  const score = settlement.finalScore;
  if (!score) return "Not provided";
  return `${score.homeScore}-${score.awayScore}`;
}

export type BetsEmptyState = { title: string; copy: string };

/**
 * Pure rendering of a page of wager history — one row per wager, the money
 * in a right-hand column so it lines up down the list; an honest empty state
 * otherwise. `compact` is the summary's version: one line, no illustration.
 * Split out from the page server component (which owns auth, search-param
 * parsing, and the DB read) so this half is directly testable.
 */
export function BetsHistory({
  items,
  emptyState,
  compact = false,
}: {
  items: Wager[];
  emptyState: BetsEmptyState;
  compact?: boolean;
}) {
  const { formatNumber, t } = useTranslation();
  if (items.length === 0) {
    if (compact) {
      return (
        <Link className="bet-list-empty" href="/">
          <span>{t(emptyState.title)}</span>
          <span className="bet-list-empty-cta">
            {t("Explore upcoming games")}
            <ChevronRight aria-hidden="true" size={16} />
          </span>
        </Link>
      );
    }
    return (
      <div className="empty-state">
        <div>
          <span className="empty-icon">
            <Receipt aria-hidden="true" />
          </span>
          <h3 className="empty-title">{t(emptyState.title)}</h3>
          <p className="empty-copy">{t(emptyState.copy)}</p>
          <Button asChild variant="secondary" size="sm" className="mt-4">
            <Link href="/">{t("Explore upcoming games")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ul className="bet-list">
      {items.map((wager) => {
        const settlement = wager.settlement;
        const net = settlement ? settlement.returned - wager.stake : undefined;
        const result = decidingResult(settlement);
        return (
          <li className="bet-row" key={wager.id}>
            <div className="bet-row-main">
              <Link className="bet-row-match" href={`/games/${wager.routeId}`}>
                {wager.matchup}
              </Link>
              <span className="bet-row-pick">
                {t(wagerSelectionLabel(wager))}
                <span> · {t(wager.marketLabel)}</span>
              </span>
              <span className="bet-row-meta">
                <span>{t(wager.competition)}</span>
                <span>
                  {t("Odds")} {formatNumber(wager.price, 2)}
                </span>
                <span>
                  {t("Stake")} {formatNumber(wager.stake)}
                </span>
                {result && (
                  <span>
                    {t("Result")} {t(result)}
                  </span>
                )}
                <LocalDateTime value={wager.placedAt} short />
              </span>
            </div>
            <div className="bet-row-side">
              {settlement ? (
                <StatusTag tone={outcomeTone(settlement.outcome)}>
                  {t(settlementLabel(settlement.outcome))}
                </StatusTag>
              ) : (
                <StatusTag tone="neutral">{t("open")}</StatusTag>
              )}
              <strong
                className="bet-row-net"
                data-tone={net === undefined ? "open" : net > 0 ? "up" : "down"}
              >
                {net === undefined
                  ? "—"
                  : `${net > 0 ? "+" : ""}${formatNumber(net)}`}
              </strong>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
