import {
  GroupActivity,
  GroupStandings,
  GroupUpcoming,
} from "@/components/group-activity";
import { Breadcrumb } from "@/components/breadcrumb";
import { GroupTabs } from "@/components/group-tabs";
import { getTranslation } from "@/lib/locale-server";
import type { Metadata } from "next";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SPORT_COOKIE, sportPreferenceSchema } from "@/lib/sport-preference";
import { UserPlus, Users } from "lucide-react";
import { NavigationLink as Link } from "@/components/fast-link";
import { Button } from "@/components/ui/button";
import { getCachedDashboardData } from "@/data/sports-data";
import { upcomingGroupFixtures } from "@/lib/group-activity";
import { InviteMemberForm } from "@/components/invite-member-form";
import { JoinLink } from "@/components/join-link";
import { NotifyToggle } from "@/components/notify-toggle";
import { RevokeInviteButton } from "@/components/revoke-invite-button";
import { Card } from "@/components/ui/card";
import {
  getGroupBySlug,
  getGroupLeaderboard,
  isGroupMember,
  listGroupMembers,
  listPendingInvites,
} from "@/data/groups-repository";
import { listGroupMatchActivity } from "@/data/wagers-repository";
import { requireAccount } from "@/lib/auth";

export const dynamic = "force-dynamic";
// Client router cache, page-scoped. See src/app/games/[id]/page.tsx.
export const unstable_dynamicStaleTime = 300;

// generateMetadata and the page both need the group; cache() makes it one query.
const loadGroup = cache((slug: string) => getGroupBySlug(slug));

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const group = await loadGroup(slug);
  return { title: group?.name ?? "Group" };
}

export default async function Page({ params }: Props) {
  const { t } = await getTranslation();
  const { slug } = await params;
  const [account, group] = await Promise.all([
    requireAccount(),
    loadGroup(slug),
  ]);
  if (!account.ok) {
    if (account.reason === "unconfigured") notFound();
    redirect(`/sign-in?callbackUrl=/groups/${slug}`);
  }

  // A non-member sees the same not-found response as a group that does not
  // exist — membership is never disclosed to a non-member.
  if (!group || !(await isGroupMember(group.id, account.userId))) notFound();

  const [members, leaderboard, wagerActivity, pendingInvites, dashboard] =
    await Promise.all([
      listGroupMembers(group.id),
      getGroupLeaderboard(group.id),
      listGroupMatchActivity(group.id, 20),
      listPendingInvites(group.id),
      getCachedDashboardData(),
    ]);
  // The board's remembered sport chip narrows the fixtures here too, so a
  // football-only reader isn't shown baseball to bet on.
  const sport = sportPreferenceSchema.parse(
    (await cookies()).get(SPORT_COOKIE)?.value,
  );
  const upcoming = upcomingGroupFixtures(
    Object.values(dashboard)
      .flatMap((schedule) => schedule.games)
      .filter((game) => sport === "all" || game.sport === sport),
    wagerActivity,
  );
  // A fixture in "Upcoming games" already shows who is in on it.
  const upcomingIds = new Set(upcoming.map(({ game }) => game.id));
  const recentActivity = wagerActivity.filter(
    (match) =>
      !(
        (match.game && upcomingIds.has(match.game.id)) ||
        match.bets.some(({ wager }) => upcomingIds.has(wager.routeId))
      ),
  );
  const memberNames = members.map((member) => ({
    userId: member.userId,
    name: member.name ?? member.email,
  }));
  // Only email-targeted invites here — the one live join-link invite is
  // entirely self-managed by <JoinLink>, which never needs to expose its
  // token through this list-shaped read.
  const pendingEmailInvites = pendingInvites.filter(
    (invite) => invite.email !== null,
  );

  return (
    <div className="group-detail">
      <header className="page-heading">
        <Breadcrumb
          items={[
            { label: t("Groups"), href: "/groups" },
            { label: group.name },
          ]}
        />
        <div>
          <p className="eyebrow">{t("Group wagers")}</p>
          <h1 className="display-title">{group.name}</h1>
          <p className="page-description">
            {members.length} {t(members.length === 1 ? "member" : "members")}
          </p>
        </div>
      </header>

      <GroupTabs
        action={
          <Button asChild variant="secondary" className="group-tabs-action">
            <Link href={`/groups/${group.slug}?tab=members#invite`}>
              <UserPlus aria-hidden="true" size={16} />
              {t("Invite")}
            </Link>
          </Button>
        }
        overview={
          <div className="group-overview">
            <GroupStandings entries={leaderboard} viewerId={account.userId} />
            <GroupUpcoming
              fixtures={upcoming}
              members={memberNames}
              viewerId={account.userId}
            />
            <GroupActivity
              matches={recentActivity}
              members={memberNames}
              viewerId={account.userId}
            />
          </div>
        }
        members={
          <Card
            title={t("Members")}
            titleId="members-heading"
            headerExtra={
              <span className="fine-print inline-flex items-center gap-1.5">
                <Users aria-hidden="true" size={13} />
                {members.length}{" "}
                {members.length === 1 ? t("member") : t("members")}
              </span>
            }
          >
            {members.map((member) => (
              <div className="stat-row" key={member.userId}>
                <span>{member.name ?? member.email ?? t("Member")}</span>
                <span className="fine-print">{t(member.role)}</span>
              </div>
            ))}
            <div className="form-block">
              <NotifyToggle
                slug={group.slug}
                enabled={
                  members.find((member) => member.userId === account.userId)
                    ?.notifyOnActivity ?? true
                }
              />
            </div>
            <div className="form-block" id="invite">
              <JoinLink slug={group.slug} />
            </div>
            <div className="form-block">
              <InviteMemberForm slug={group.slug} />
            </div>
            {pendingEmailInvites.length > 0 && (
              <div className="form-block">
                <span className="field-label">{t("Outstanding invites")}</span>
                {pendingEmailInvites.map((invite) => (
                  <div className="stat-row" key={invite.id}>
                    <span>{invite.email}</span>
                    <RevokeInviteButton
                      slug={group.slug}
                      inviteId={invite.id}
                    />
                  </div>
                ))}
              </div>
            )}
          </Card>
        }
      />
    </div>
  );
}
