"use client";
import { useTranslation } from "@/components/language-provider";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { LocalDateTime } from "@/components/local-date-time";
import { Button } from "@/components/ui/button";
import { StatusTag } from "@/components/ui/status-tag";
import type { Wager, WagerSettlement } from "@/lib/contracts";
import { wagerSelectionLabel } from "@/lib/markets";
import { outcomeTone, settlementLabel } from "@/lib/wager-copy";

/**
 * The score that decided a settled wager. A void was decided by nothing, and
 * a game whose row has since gone carries no score — both read honestly
 * rather than as a fabricated 0-0.
 */
function decidingResult(settlement: WagerSettlement | undefined) {
  if (!settlement) return "Pending";
  if (settlement.outcome === "void") return "Voided";
  const score = settlement.finalScore;
  if (!score) return "Not provided";
  return `${score.homeScore}-${score.awayScore}`;
}

export type BetsEmptyState = { title: string; copy: string };

/**
 * Pure rendering of a page of wager history — table when there is at least
 * one row, an honest empty state otherwise. Split out from the /bets server
 * component (which owns auth, search-param parsing, and the DB read) so this
 * half — the part with actual branching logic worth breaking — is directly
 * testable without mocking the database.
 */
export function BetsHistory({
  items,
  emptyState,
}: {
  items: Wager[];
  emptyState: BetsEmptyState;
}) {
  const { formatNumber, t } = useTranslation();
  if (items.length === 0) {
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
    <div className="table-wrap">
      <table className="wager-table">
        <caption className="sr-only">{t("Wager history")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("Matchup")}</th>
            <th scope="col">{t("Competition")}</th>
            <th scope="col">{t("Selection")}</th>
            <th scope="col">{t("Price")}</th>
            <th scope="col">{t("Stake")}</th>
            <th scope="col">{t("Outcome")}</th>
            <th scope="col">{t("Result")}</th>
            <th scope="col">{t("Returned")}</th>
            <th scope="col">{t("Net")}</th>
            <th scope="col">{t("Placed")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((wager) => {
            const settlement = wager.settlement;
            const net = settlement
              ? settlement.returned - wager.stake
              : undefined;
            return (
              <tr key={wager.id}>
                <td>
                  <Link href={`/games/${wager.routeId}`}>{wager.matchup}</Link>
                </td>
                <td>{t(wager.competition)}</td>
                <td>
                  {t(wagerSelectionLabel(wager))}
                  <span className="fine-print"> · {t(wager.marketLabel)}</span>
                </td>
                <td>{formatNumber(wager.price, 2)}</td>
                <td>{wager.stake}</td>
                <td>
                  {settlement ? (
                    <StatusTag tone={outcomeTone(settlement.outcome)}>
                      {t(settlementLabel(settlement.outcome))}
                    </StatusTag>
                  ) : (
                    <StatusTag tone="neutral">{t("open")}</StatusTag>
                  )}
                </td>
                <td>{t(decidingResult(settlement))}</td>
                <td>{settlement ? settlement.returned : t("Pending")}</td>
                <td>{net !== undefined ? net : t("Pending")}</td>
                <td>
                  <LocalDateTime value={wager.placedAt} short />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
