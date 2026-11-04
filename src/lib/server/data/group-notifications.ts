import { appBaseUrl, sendEmail } from "../email";
import { logEvent } from "../logger";
import { listGroupsByIds, listNotifiableMembers } from "./groups-repository";

/**
 * Best-effort. An unconfigured or failing mail provider must not fail the
 * placement that already committed. Only the wager-placed mail is ported;
 * settlement and invite mail belong to later tickets.
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
