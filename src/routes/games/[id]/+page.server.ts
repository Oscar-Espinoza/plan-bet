import { error } from "@sveltejs/kit";
import { isAuthConfigured, requireAccount } from "#lib/server/auth";
import {
  commentPhase,
  listCommentThreads,
  pickPins,
} from "#lib/server/data/game-comments";
import { getCreditSummary } from "#lib/server/data/credits";
import { listGroupsForUser } from "#lib/server/data/groups-repository";
import { toSlipWager } from "#lib/server/data/slip-wager";
import { getGameDetail } from "#lib/server/data/sports-data";
import { evaluateWagerAvailability } from "#lib/server/data/wagers";
import {
  getRecordSlices,
  listGroupWagersForGame,
  listWagersForGame,
  readGameForWager,
} from "#lib/server/data/wagers-repository";
import { getTeam } from "#lib/server/domain/seed";
import { getTranslation } from "#lib/server/locale";
import { buildMatchView } from "#lib/shared/game-view";
import type { SocialDiscussionView } from "#lib/shared/comment-view";
import { marketsFor } from "#lib/shared/markets";
import type { WagerPanelData } from "#lib/shared/wager-view";
import type { PageServerLoad } from "./$types";

const DESCRIPTION =
  "Practice your calls on real upcoming Real Madrid, Barcelona, Yankees, and Red Sox fixtures: source-backed context, an AI buddy that reads the same facts, and a free-to-play bet simulator on fictional credits. Browsing needs no account. Not a sportsbook.";

/**
 * Slip state comes from the games row, not the snapshot the rest of the page
 * may have cached. A seed-only route is unavailable. A started or finished
 * row is closed. Placement re-checks the same facts inside its batch.
 */
function loadWagering(
  userId: string,
  routeId: string,
): Promise<WagerPanelData> {
  return readWagering(userId, routeId);
}

async function readWagering(
  userId: string,
  routeId: string,
): Promise<WagerPanelData> {
  const game = await readGameForWager(routeId);
  if (!game) {
    return {
      signedIn: true,
      routeId,
      state: { kind: "unavailable" },
      wagers: [],
      groupPicks: [],
    };
  }

  const [summary, gameWagers, groups, record, groupPicks] = await Promise.all([
    getCreditSummary(userId),
    listWagersForGame(userId, game.canonicalId),
    listGroupsForUser(userId),
    getRecordSlices(userId),
    listGroupWagersForGame(userId, game.canonicalId),
  ]);
  const availability = evaluateWagerAvailability(game.summary);
  const state: WagerPanelData["state"] = availability.open
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
    wagers: gameWagers.map(toSlipWager),
    groupPicks: groupPicks.map((pick) => ({
      wager: toSlipWager(pick.wager),
      userName: pick.userName,
      groupName: pick.groupName,
    })),
  };
}

async function loadSocialDiscussion(
  userId: string,
  routeId: string,
): Promise<SocialDiscussionView | null> {
  const memberships = await listGroupsForUser(userId);
  if (memberships.length === 0) return null;

  const game = await readGameForWager(routeId);
  if (!game) return null;

  const [threads, gameWagers] = await Promise.all([
    listCommentThreads(userId, game.canonicalId),
    listWagersForGame(userId, game.canonicalId),
  ]);
  if (threads.length === 0) return null;

  const currentPhase = commentPhase(
    game.summary.scheduledAt,
    new Date(),
    game.summary.status,
  );

  return {
    threads: threads.map((thread) => ({
      groupId: thread.groupId,
      groupName: thread.groupName,
      comments: thread.comments,
      postingPhase: currentPhase,
      hasCommented: thread.comments.some(
        (comment) =>
          comment.userId === userId && comment.phase === currentPhase,
      ),
      viewerSelectionLabel:
        gameWagers.find((wager) => wager.groupId === thread.groupId)
          ?.selectionLabel ?? null,
      pins: pickPins(thread.comments),
    })),
  };
}

export const load: PageServerLoad = async (event) => {
  const id = event.params.id;
  const detail = await getGameDetail(id);
  if (!detail) error(404, "Game not found");
  const team = getTeam(detail.snapshot.game.teamSlug);
  if (!team) error(404, "Game not found");

  const { t } = getTranslation({
    cookieLocale: event.locals.locale,
    acceptLanguage: event.request.headers.get("accept-language"),
  });
  const account = requireAccount(event);
  const { game } = detail.snapshot;
  const page = {
    view: buildMatchView(detail.snapshot, team),
    sport: game.sport,
    finished: game.status === "finished",
    home: game.homeTeam,
    away: game.awayTeam,
    routeId: id,
    title: `${game.awayTeam} at ${game.homeTeam} · Matchday Plan`,
    description: t(DESCRIPTION),
  };

  // Signed-out (auth configured) matches T06: the sign-in card, and no
  // wagering promise for the edge cache to store. Unconfigured renders
  // nothing, as legacy does. Signed-in streams the panel.
  if (!account.ok) {
    return {
      ...page,
      signedOut: isAuthConfigured() && account.reason === "unauthenticated",
    };
  }

  return {
    ...page,
    signedOut: false as const,
    wagering: loadWagering(account.userId, id),
    socialDiscussion: loadSocialDiscussion(account.userId, id),
  };
};
