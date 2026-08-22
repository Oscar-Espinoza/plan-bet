import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { WagerPanelData, WagerPanelState } from "@/components/bet-slip";
import { GameDetail } from "@/components/game-detail";
import { getCreditSummary } from "@/data/credits";
import { listGroupsForUser } from "@/data/groups-repository";
import { getGameDetail } from "@/data/sports-data";
import { evaluateWagerAvailability } from "@/data/wagers";
import {
  getRecordSlices,
  listGroupWagersForGame,
  listWagersForGame,
  readGameForWager,
} from "@/data/wagers-repository";
import { requireAccount } from "@/lib/auth";
import { marketsFor } from "@/lib/markets";
import { getTeam } from "@/lib/seed";
import { isOpenAiConfigured } from "@/providers/openai/client";

type Props = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";
// Minting requestId inside the cached function (rather than threading it in
// as an argument) keeps the cache key as just `id`, so generateMetadata and
// the page component still share one underlying call.
const loadGame = cache((id: string) =>
  getGameDetail(id, { requestId: randomUUID() }),
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const detail = await loadGame(id);
  if (!detail) return { title: "Matchup not found" };
  return {
    title: `${detail.snapshot.game.awayTeam} at ${detail.snapshot.game.homeTeam}`,
  };
}

/**
 * Renders nothing when sign-in isn't configured (`undefined`, matching
 * AccountControl); otherwise the slip's state, always read from the `games`
 * row rather than the (possibly cached) snapshot the rest of the page uses —
 * this is what makes an out-of-DB seed/demo route "unavailable" and a
 * started/finished game "closed" before any submission is attempted. The
 * placement route re-derives the same state authoritatively regardless.
 */
async function loadWagering(
  routeId: string,
): Promise<WagerPanelData | undefined> {
  const account = await requireAccount();
  if (!account.ok) {
    return account.reason === "unconfigured"
      ? undefined
      : { signedIn: false, routeId };
  }

  const game = await readGameForWager(routeId);
  if (!game) {
    return {
      signedIn: true,
      routeId,
      state: { kind: "unavailable" },
      wagers: [],
    };
  }

  const [summary, gameWagers, groups, record, groupPicks] = await Promise.all([
    getCreditSummary(account.userId),
    listWagersForGame(account.userId, game.canonicalId),
    listGroupsForUser(account.userId),
    getRecordSlices(account.userId),
    listGroupWagersForGame(account.userId, game.canonicalId),
  ]);
  const availability = evaluateWagerAvailability(game.summary);
  const state: WagerPanelState = availability.open
    ? {
        kind: "open",
        markets: marketsFor(game.sport),
        balance: summary.balance,
        groups: groups.map((group) => ({ id: group.id, name: group.name })),
        byMarket: record.byMarket,
        groupPicks: groupPicks.map((pick) => ({
          wager: pick.wager,
          userName: pick.userName,
          groupName: pick.groupName,
        })),
      }
    : { kind: "closed", reason: availability.reason };

  return { signedIn: true, routeId, state, wagers: gameWagers };
}

export default async function GamePage({ params }: Props) {
  const { id } = await params;
  const detail = await loadGame(id);
  if (!detail) notFound();
  const team = getTeam(detail.snapshot.game.teamSlug);
  if (!team) notFound();
  const wagering = await loadWagering(id);
  return (
    <GameDetail
      data={detail}
      team={team}
      aiEnabled={isOpenAiConfigured()}
      wagering={wagering}
    />
  );
}
