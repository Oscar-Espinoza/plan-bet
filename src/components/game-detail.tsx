"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BetSlip, type WagerPanelData } from "@/components/bet-slip";
import { ContextBlocks } from "@/components/matchup/context-blocks";
import { Scorebug } from "@/components/matchup/scorebug";
import { StatusRibbon } from "@/components/matchup/status-ribbon";
import type { GameDetailData, Team } from "@/lib/contracts";
import { buildMatchView } from "@/lib/game-view";

/**
 * The matchup page, composed from one view model.
 *
 * Nothing here reads the snapshot: `buildMatchView` is the single place that
 * knows where a number came from, so a component below can be replaced
 * without touching a contract. Provenance — the fact list, the source list,
 * the freshness stamp — is deliberately absent from the page: those facts
 * still ground the buddy and still show on /system, but a reader deciding a
 * call is not served by an audit trail competing with the matchup.
 */
export function GameDetail({
  data,
  team,
  wagering,
}: {
  data: GameDetailData;
  team: Team;
  // Optional so game-detail.test.tsx keeps compiling without wiring it.
  // Absent entirely when sign-in isn't configured — matches AccountControl.
  wagering?: WagerPanelData;
}) {
  const view = buildMatchView(data.snapshot, team);
  const { game } = data.snapshot;

  return (
    <div className="mp">
      <h1 className="sr-only">
        {game.result
          ? `${game.homeTeam} ${game.result.homeScore} – ${game.result.awayScore} ${game.awayTeam}, final`
          : `${game.homeTeam} vs ${game.awayTeam}`}
      </h1>
      <Link href="/" className="mp-back">
        <ArrowLeft aria-hidden="true" size={14} /> Back to games
      </Link>

      <Scorebug {...view} />
      <StatusRibbon status={view.timing.status} />

      {/* The action comes first in the DOM, so on a phone the thing you came
          to do is above the reading material rather than three screens under
          it. Above 1100px the same node is placed into the right column by
          grid, without a second render order for assistive tech. */}
      <div className="mp-layout">
        {wagering && (
          <aside className="mp-action" aria-label="Place a bet">
            <BetSlip
              data={wagering}
              matchup={{ home: game.homeTeam, away: game.awayTeam }}
            />
          </aside>
        )}
        <div className="mp-read">
          <ContextBlocks
            blocks={view.blocks}
            homeTeam={view.identity.homeTeam}
            awayTeam={view.identity.awayTeam}
          />
        </div>
      </div>
    </div>
  );
}
