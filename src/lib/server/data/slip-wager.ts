import type { Wager } from "../domain/contracts";
import type { SlipWager } from "../../shared/wager-view";

/** The columns the slip and history rows print. */
export function toSlipWager(wager: Wager): SlipWager {
  return {
    id: wager.id,
    routeId: wager.routeId,
    selectionId: wager.selectionId,
    selectionLabel: wager.selectionLabel,
    marketLabel: wager.marketLabel,
    line: wager.line,
    price: wager.price,
    stake: wager.stake,
    potentialReturn: wager.potentialReturn,
    placedAt: wager.placedAt,
    matchup: wager.matchup,
    competition: wager.competition,
    settlement: wager.settlement
      ? {
          outcome: wager.settlement.outcome,
          returned: wager.settlement.returned,
          finalScore: wager.settlement.finalScore,
        }
      : undefined,
  };
}
