import { getTranslation } from "@/lib/locale-server";
import { GameThread } from "@/components/game-thread";
import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import {
  BetSlip,
  type WagerPanelData,
  type WagerPanelState,
} from "@/components/bet-slip";
import { GameDetail } from "@/components/game-detail";
import { getCreditSummary } from "@/data/credits";
import {
  commentPhase,
  listCommentThreads,
  pickPins,
} from "@/data/game-comments";
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

type Props = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";
export const unstable_dynamicStaleTime = 30;
const loadWagerGame = cache(readGameForWager);
const loadGameWagers = cache(listWagersForGame);
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

  const game = await loadWagerGame(routeId);
  if (!game) {
    return {
      signedIn: true,
      routeId,
      state: { kind: "unavailable" },
      wagers: [],
      groupPicks: [],
      threads: [],
    };
  }

  const [summary, gameWagers, groups, record, groupPicks] = await Promise.all([
    getCreditSummary(account.userId),
    loadGameWagers(account.userId, game.canonicalId),
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
      }
    : { kind: "closed", reason: availability.reason };

  return {
    signedIn: true,
    routeId,
    state,
    wagers: gameWagers,
    groupPicks: groupPicks.map((pick) => ({
      wager: pick.wager,
      userName: pick.userName,
      groupName: pick.groupName,
    })),
    threads: [],
  };
}

export default async function GamePage({ params }: Props) {
  const { t } = await getTranslation();
  const { id } = await params;
  const detail = await loadGame(id);
  if (!detail) notFound();
  const team = getTeam(detail.snapshot.game.teamSlug);
  if (!team) notFound();
  return (
    <GameDetail
      data={detail}
      team={team}
      wageringPanel={
        <Suspense
          fallback={
            <aside
              className="mp-action"
              aria-busy="true"
              aria-label={t("Place a bet")}
            >
              <p role="status">{t("Loading…")}</p>
            </aside>
          }
        >
          <WageringPanel
            finished={detail.snapshot.game.status === "finished"}
            routeId={id}
            home={detail.snapshot.game.homeTeam}
            away={detail.snapshot.game.awayTeam}
          />
        </Suspense>
      }
      socialPanel={
        <Suspense fallback={null}>
          <SocialPanel
            routeId={id}
            home={detail.snapshot.game.homeTeam}
            away={detail.snapshot.game.awayTeam}
          />
        </Suspense>
      }
    />
  );
}

async function WageringPanel({
  routeId,
  home,
  away,
  finished,
}: {
  routeId: string;
  home: string;
  away: string;
  finished: boolean;
}) {
  const { t } = await getTranslation();
  const data = await loadWagering(routeId);
  if (!data) return null;
  return (
    <aside
      className="mp-action"
      aria-label={t(finished ? "Your match results" : "Place a bet")}
    >
      <BetSlip data={data} matchFinished={finished} matchup={{ home, away }} />
    </aside>
  );
}

async function SocialPanel({
  routeId,
  home,
  away,
}: {
  routeId: string;
  home: string;
  away: string;
}) {
  const account = await requireAccount();
  if (!account.ok) return null;
  const game = await loadWagerGame(routeId);
  if (!game) return null;
  const [threads, gameWagers, { t }] = await Promise.all([
    listCommentThreads(account.userId, game.canonicalId),
    loadGameWagers(account.userId, game.canonicalId),
    getTranslation(),
  ]);
  const currentPhase = commentPhase(
    game.summary.scheduledAt,
    new Date(),
    game.summary.status,
  );
  const data = {
    threads: threads.map((thread) => ({
      groupId: thread.groupId,
      groupName: thread.groupName,
      comments: thread.comments,
      postingPhase: currentPhase,
      hasCommented: thread.comments.some(
        (comment) =>
          comment.userId === account.userId && comment.phase === currentPhase,
      ),
      // The viewer's own side in this group, on this game — never a
      // second lookup, just the wager the game already read for the slip.
      viewerSelectionLabel:
        gameWagers.find((wager) => wager.groupId === thread.groupId)
          ?.selectionLabel ?? null,
      pins: pickPins(thread.comments),
    })),
  };
  if (!data.threads.length) return null;
  return (
    <section
      className="group-discussion"
      id="group-discussion"
      aria-labelledby="group-discussion-heading"
    >
      <h2 id="group-discussion-heading">{t("Group discussion")}</h2>
      {data.threads.map((thread) => (
        <GameThread
          key={thread.groupId}
          routeId={routeId}
          thread={thread}
          matchup={{ home, away }}
        />
      ))}
    </section>
  );
}
