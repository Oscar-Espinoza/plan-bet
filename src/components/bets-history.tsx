import Link from "next/link";
import { Receipt } from "lucide-react";
import { LocalDateTime } from "@/components/local-date-time";
import { Button } from "@/components/ui/button";
import { StatusTag } from "@/components/ui/status-tag";
import type { Wager, WagerSettlement } from "@/lib/contracts";
import { outcomeTone, settlementLabel } from "@/lib/wager-copy";

function lineSuffix(line: number | undefined) {
  return typeof line === "number" ? ` ${line}` : "";
}

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
  if (items.length === 0) {
    return (
      <div className="empty-state">
        <div>
          <span className="empty-icon">
            <Receipt aria-hidden="true" />
          </span>
          <h3 className="empty-title">{emptyState.title}</h3>
          <p className="empty-copy">{emptyState.copy}</p>
          <Button asChild variant="secondary" size="sm" className="mt-4">
            <Link href="/">Explore upcoming games</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="wager-table">
        <caption className="sr-only">Wager history</caption>
        <thead>
          <tr>
            <th scope="col">Matchup</th>
            <th scope="col">Competition</th>
            <th scope="col">Selection</th>
            <th scope="col">Price</th>
            <th scope="col">Stake</th>
            <th scope="col">Outcome</th>
            <th scope="col">Result</th>
            <th scope="col">Returned</th>
            <th scope="col">Net</th>
            <th scope="col">Placed</th>
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
                <td>{wager.competition}</td>
                <td>
                  {wager.selectionLabel}
                  {lineSuffix(wager.line)}
                  <span className="fine-print"> · {wager.marketLabel}</span>
                </td>
                <td>{wager.price.toFixed(2)}</td>
                <td>{wager.stake}</td>
                <td>
                  {settlement ? (
                    <StatusTag tone={outcomeTone(settlement.outcome)}>
                      {settlementLabel(settlement.outcome)}
                    </StatusTag>
                  ) : (
                    <StatusTag tone="neutral">open</StatusTag>
                  )}
                </td>
                <td>{decidingResult(settlement)}</td>
                <td>{settlement ? settlement.returned : "Pending"}</td>
                <td>{net !== undefined ? net : "Pending"}</td>
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
