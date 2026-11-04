import { error } from "@sveltejs/kit";
import { requireAccount } from "#lib/server/auth";
import { getGameDetail } from "#lib/server/data/sports-data";
import { getTeam } from "#lib/server/domain/seed";
import { getTranslation } from "#lib/server/locale";
import { buildMatchView } from "#lib/shared/game-view";
import type { PageServerLoad } from "./$types";

const DESCRIPTION =
  "Practice your calls on real upcoming Real Madrid, Barcelona, Yankees, and Red Sox fixtures: source-backed context, an AI buddy that reads the same facts, and a free-to-play bet simulator on fictional credits. Browsing needs no account. Not a sportsbook.";

export const load: PageServerLoad = async (event) => {
  const id = event.params.id;
  // Unknown ids stop here. getGameDetail reads KV, then D1, then the seed.
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

  return {
    view: buildMatchView(detail.snapshot, team),
    sport: game.sport,
    finished: game.status === "finished",
    home: game.homeTeam,
    away: game.awayTeam,
    routeId: id,
    // Anonymous card, including when auth is unconfigured (legacy returns
    // null then). Signed-in slip is T08. No wager API call.
    signedOut: !account.ok,
    title: `${game.awayTeam} at ${game.homeTeam} · Matchday Plan`,
    description: t(DESCRIPTION),
  };
};
