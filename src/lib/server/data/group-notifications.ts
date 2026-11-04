import type { WagerOutcome } from "../domain/contracts";
import { appBaseUrl, sendEmail } from "../email";
import { logEvent } from "../logger";
import { listGroupsByIds, listNotifiableMembers } from "./groups-repository";

/**
 * Best-effort. An unconfigured or failing mail provider must not fail the
 * wager path that already committed.
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
