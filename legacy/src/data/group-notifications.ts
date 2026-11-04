import "server-only";

import {
  listGroupsByIds,
  listNotifiableMembers,
} from "@/data/groups-repository";
import type { WagerOutcome } from "@/lib/contracts";
import { appBaseUrl, sendEmail } from "@/lib/email";
import { logEvent } from "@/lib/logger";

/**
 * Every notifier here is best-effort: it resolves even when the mail
 * provider is unconfigured or failing, so a group wager is never blocked by
 * an email. Callers await it rather than firing and forgetting — a detached
 * promise does not survive a serverless invocation ending.
 */

export async function notifyGroupWagerPlaced(input: {
  groupId: string;
  actorUserId: string;
  actorName: string | null;
  matchup: string;
  selectionLabel: string;
  stake: number;
}): Promise<void> {
  try {
    const [members, groupsById] = await Promise.all([
      listNotifiableMembers(input.groupId, input.actorUserId),
      listGroupsByIds([input.groupId]),
    ]);
    const group = groupsById.get(input.groupId);
    if (!group || members.length === 0) return;

    const who = input.actorName ?? "A member";
    const link = `${appBaseUrl()}/groups/${group.slug}`;
    await Promise.all(
      members.map((member) =>
        sendEmail({
          to: member.email,
          subject: `${who} placed a wager in ${group.name}`,
          text: [
            `${who} staked ${input.stake} credits on ${input.selectionLabel} — ${input.matchup}.`,
            "",
            `See the group: ${link}`,
            "",
            "Matchday Plan is free-to-play. Credits are fictional and cannot be withdrawn.",
          ].join("\n"),
        }),
      ),
    );
  } catch (error) {
    logEvent("warn", "group_notification_failed", {
      trigger: "wager_placed",
      error,
    });
  }
}

export type SettledGroupWager = {
  groupId: string;
  userId: string;
  matchup: string;
  selectionLabel: string;
  outcome: WagerOutcome;
  returned: number;
};

function describe(wager: SettledGroupWager, who: string): string {
  switch (wager.outcome) {
    case "won":
      return `${who} won ${wager.returned} on ${wager.selectionLabel} — ${wager.matchup}.`;
    case "void":
      return `${who} had ${wager.selectionLabel} voided — ${wager.matchup}. Stake returned.`;
    case "lost":
      return `${who} lost on ${wager.selectionLabel} — ${wager.matchup}.`;
  }
}

/**
 * One email per member per settlement run, not per wager — a run can grade
 * many wagers at once and a member should get a single digest, never a burst.
 */
export async function notifyGroupSettlements(
  settled: SettledGroupWager[],
): Promise<void> {
  if (settled.length === 0) return;
  try {
    const groupIds = [...new Set(settled.map((wager) => wager.groupId))];
    const groupsById = await listGroupsByIds(groupIds);
    const baseUrl = appBaseUrl();

    for (const groupId of groupIds) {
      const group = groupsById.get(groupId);
      if (!group) continue;
      const members = await listNotifiableMembers(groupId);
      if (members.length === 0) continue;
      const nameByUserId = new Map(
        members.map((member) => [member.userId, member.name]),
      );
      const rows = settled.filter((wager) => wager.groupId === groupId);

      await Promise.all(
        members.map((member) =>
          sendEmail({
            to: member.email,
            subject: `${rows.length} wager${rows.length === 1 ? "" : "s"} settled in ${group.name}`,
            text: [
              ...rows.map((wager) =>
                describe(
                  wager,
                  wager.userId === member.userId
                    ? "You"
                    : (nameByUserId.get(wager.userId) ?? "A member"),
                ),
              ),
              "",
              `Standings: ${baseUrl}/groups/${group.slug}`,
              "",
              "Matchday Plan is free-to-play. Credits are fictional and cannot be withdrawn.",
            ].join("\n"),
          }),
        ),
      );
    }
  } catch (error) {
    logEvent("warn", "group_notification_failed", {
      trigger: "settlement",
      error,
    });
  }
}

export async function notifyGroupInvite(input: {
  email: string;
  token: string;
  groupName: string;
  invitedByName: string | null;
}): Promise<boolean> {
  const who = input.invitedByName ?? "Someone";
  const result = await sendEmail({
    to: input.email,
    subject: `${who} invited you to ${input.groupName} on Matchday Plan`,
    text: [
      `${who} invited you to place free-to-play wagers with ${input.groupName}.`,
      "",
      `Accept the invite: ${appBaseUrl()}/groups/accept/${input.token}`,
      "",
      "The link expires in 7 days and only works for this email address.",
      "Credits are fictional and cannot be withdrawn — no real money is involved.",
    ].join("\n"),
  });
  return result.sent;
}
