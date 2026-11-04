import { error, redirect } from "@sveltejs/kit";
import { requireAccount } from "#lib/server/auth";
import {
  getGroupBySlug,
  getGroupLeaderboard,
  isGroupMember,
  listGroupMembers,
  listPendingInvites,
} from "#lib/server/data/groups-repository";
import { getCachedDashboardData } from "#lib/server/data/sports-data";
import { listGroupMatchActivity } from "#lib/server/data/wagers-repository";
import { getTranslation } from "#lib/server/locale";
import { upcomingGroupFixtures } from "#lib/shared/group-activity";
import {
  parseSportPreference,
  SPORT_COOKIE,
} from "#lib/shared/sport-preference";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const { t } = getTranslation({
    cookieLocale: event.locals.locale,
    acceptLanguage: event.request.headers.get("accept-language"),
  });
  const account = requireAccount(event);
  if (!account.ok) {
    if (account.reason === "unconfigured") error(404, "Not found");
    redirect(303, `/sign-in?callbackUrl=/groups/${event.params.slug}`);
  }

  const group = await getGroupBySlug(event.params.slug);
  if (!group || !(await isGroupMember(group.id, account.userId))) {
    error(404, "Not found");
  }

  const [members, leaderboard, wagerActivity, pendingInvites, dashboard] =
    await Promise.all([
      listGroupMembers(group.id),
      getGroupLeaderboard(group.id),
      listGroupMatchActivity(group.id, 20),
      listPendingInvites(group.id),
      getCachedDashboardData(),
    ]);
  const sport = parseSportPreference(event.cookies.get(SPORT_COOKIE));
  const upcoming = upcomingGroupFixtures(
    Object.values(dashboard)
      .flatMap((schedule) => schedule.games)
      .filter((game) => sport === "all" || game.sport === sport),
    wagerActivity,
  );
  const upcomingIds = new Set(upcoming.map(({ game }) => game.id));
  const recentActivity = wagerActivity.filter(
    (match) =>
      !(
        (match.game && upcomingIds.has(match.game.id)) ||
        match.bets.some(({ wager }) => upcomingIds.has(wager.routeId))
      ),
  );
  const viewer = members.find((member) => member.userId === account.userId);

  return {
    title: group.name,
    eyebrow: t("Group wagers"),
    slug: group.slug,
    name: group.name,
    viewerId: account.userId,
    memberCount: members.length,
    notifyOnActivity: viewer?.notifyOnActivity ?? true,
    members: members.map((member) => ({
      userId: member.userId,
      name: member.name,
      email: member.email,
      role: member.role,
    })),
    leaderboard: leaderboard.map((entry) => ({
      userId: entry.userId,
      name: entry.name,
      won: entry.won,
      lost: entry.lost,
      voided: entry.voided,
      wagerCount: entry.wagerCount,
      netReturn: entry.netReturn,
    })),
    upcoming,
    recentActivity,
    pendingEmailInvites: pendingInvites
      .filter((invite) => invite.email !== null)
      .map((invite) => ({ id: invite.id, email: invite.email })),
  };
};
