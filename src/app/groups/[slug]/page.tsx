import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Receipt, Trophy, Users } from "lucide-react";
import { LocalDateTime } from "@/components/local-date-time";
import { InviteMemberForm } from "@/components/invite-member-form";
import { JoinLink } from "@/components/join-link";
import { NotifyToggle } from "@/components/notify-toggle";
import { RevokeInviteButton } from "@/components/revoke-invite-button";
import { Card } from "@/components/ui/card";
import { StatusTag } from "@/components/ui/status-tag";
import {
  getGroupBySlug,
  getGroupLeaderboard,
  isGroupMember,
  listGroupMembers,
  listPendingInvites,
} from "@/data/groups-repository";
import { listWagersForGroup } from "@/data/wagers-repository";
import { requireAccount } from "@/lib/auth";
import type { WagerOutcome } from "@/lib/contracts";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const group = await getGroupBySlug(slug);
  return { title: group?.name ?? "Group" };
}

function outcomeTone(outcome: WagerOutcome) {
  if (outcome === "won") return "positive" as const;
  if (outcome === "lost") return "negative" as const;
  return "warning" as const;
}

function lineSuffix(line: number | undefined) {
  return typeof line === "number" ? ` ${line}` : "";
}

export default async function Page({ params }: Props) {
  const account = await requireAccount();
  if (!account.ok) {
    if (account.reason === "unconfigured") notFound();
    const { slug } = await params;
    redirect(`/sign-in?callbackUrl=/groups/${slug}`);
  }

  const { slug } = await params;
  const group = await getGroupBySlug(slug);
  // A non-member sees the same not-found response as a group that does not
  // exist — membership is never disclosed to a non-member.
  if (!group || !(await isGroupMember(group.id, account.userId))) notFound();

  const [members, leaderboard, wagerActivity, pendingInvites] =
    await Promise.all([
      listGroupMembers(group.id),
      getGroupLeaderboard(group.id),
      listWagersForGroup(group.id, 20),
      listPendingInvites(group.id),
    ]);
  const nameByUserId = new Map(
    members.map((member) => [member.userId, member.name ?? member.email]),
  );
  // Only email-targeted invites here — the one live join-link invite is
  // entirely self-managed by <JoinLink>, which never needs to expose its
  // token through this list-shaped read.
  const pendingEmailInvites = pendingInvites.filter(
    (invite) => invite.email !== null,
  );

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Group wagers</p>
          <h1 className="display-title">{group.name}</h1>
          <p className="page-description">
            Wagers placed with this group are visible to every member. Fictional
            credits, house prices, never real money.
          </p>
        </div>
      </header>

      <div className="section-grid">
        <Card
          title="Members"
          titleId="members-heading"
          headerExtra={
            <span className="fine-print inline-flex items-center gap-1.5">
              <Users aria-hidden="true" size={13} />
              {members.length} {members.length === 1 ? "member" : "members"}
            </span>
          }
        >
          {members.map((member) => (
            <div className="stat-row" key={member.userId}>
              <span>{member.name ?? member.email ?? "Member"}</span>
              <span className="fine-print">{member.role}</span>
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
          <div className="form-block">
            <JoinLink slug={group.slug} />
          </div>
          <div className="form-block">
            <InviteMemberForm slug={group.slug} />
          </div>
          {pendingEmailInvites.length > 0 && (
            <div className="form-block">
              <span className="field-label">Outstanding invites</span>
              {pendingEmailInvites.map((invite) => (
                <div className="stat-row" key={invite.id}>
                  <span>{invite.email}</span>
                  <RevokeInviteButton slug={group.slug} inviteId={invite.id} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Leaderboard" titleId="leaderboard-heading">
          {leaderboard.length === 0 ? (
            <div className="empty-state empty-state-compact">
              <div>
                <span className="empty-icon">
                  <Trophy aria-hidden="true" />
                </span>
                <h3 className="empty-title">No settled wagers yet</h3>
                <p className="empty-copy">
                  The record fills in once a group wager settles.
                </p>
              </div>
            </div>
          ) : (
            leaderboard.map((entry, index) => (
              <div className="stat-row" key={entry.userId}>
                <span>
                  {index + 1}. {entry.name ?? "Member"}
                </span>
                <strong>
                  {entry.netReturn >= 0 ? "+" : ""}
                  {entry.netReturn}
                </strong>
              </div>
            ))
          )}
        </Card>
      </div>

      <section className="panel" aria-labelledby="group-wagers-heading">
        <div className="panel-header">
          <h2 className="panel-title" id="group-wagers-heading">
            Recent group wagers
          </h2>
        </div>
        {wagerActivity.length === 0 ? (
          <div className="empty-state empty-state-compact">
            <div>
              <span className="empty-icon">
                <Receipt aria-hidden="true" />
              </span>
              <h3 className="empty-title">No wagers yet</h3>
              <p className="empty-copy">
                Place a wager with this group from a game page.
              </p>
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="wager-table">
              <caption className="sr-only">Recent group wagers</caption>
              <thead>
                <tr>
                  <th scope="col">Placed by</th>
                  <th scope="col">Matchup</th>
                  <th scope="col">Selection</th>
                  <th scope="col">Stake</th>
                  <th scope="col">Outcome</th>
                  <th scope="col">Placed</th>
                </tr>
              </thead>
              <tbody>
                {wagerActivity.map(({ wager, userId }) => (
                  <tr key={wager.id}>
                    <td>{nameByUserId.get(userId) ?? "Member"}</td>
                    <td>{wager.matchup}</td>
                    <td>
                      {wager.selectionLabel}
                      {lineSuffix(wager.line)}
                    </td>
                    <td>{wager.stake}</td>
                    <td>
                      {wager.settlement ? (
                        <StatusTag tone={outcomeTone(wager.settlement.outcome)}>
                          {wager.settlement.outcome}
                        </StatusTag>
                      ) : (
                        <StatusTag tone="neutral">open</StatusTag>
                      )}
                    </td>
                    <td>
                      <LocalDateTime value={wager.placedAt} short />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
