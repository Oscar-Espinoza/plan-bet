import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  notifyGroupSettlements,
  notifyGroupWagerPlaced,
} from "@/data/group-notifications";

const { sendEmail, listNotifiableMembers, listGroupsByIds } = vi.hoisted(
  () => ({
    sendEmail: vi.fn<
      (message: {
        to: string;
        subject: string;
        text: string;
      }) => Promise<{ sent: true }>
    >(async () => ({ sent: true })),
    listNotifiableMembers: vi.fn(),
    listGroupsByIds: vi.fn(),
  }),
);

vi.mock("@/lib/email", () => ({
  sendEmail,
  appBaseUrl: () => "https://plan-bet.example",
}));

vi.mock("@/data/groups-repository", () => ({
  listNotifiableMembers,
  listGroupsByIds,
}));

const GROUP_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GROUP_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  listGroupsByIds.mockResolvedValue(
    new Map([
      [GROUP_A, { name: "Sunday League", slug: "sunday-league" }],
      [GROUP_B, { name: "Bleachers", slug: "bleachers" }],
    ]),
  );
});

describe("notifyGroupWagerPlaced", () => {
  it("emails the other opted-in members with a link to the group", async () => {
    listNotifiableMembers.mockResolvedValue([
      { userId: BOB, email: "bob@example.com", name: "Bob" },
    ]);

    await notifyGroupWagerPlaced({
      groupId: GROUP_A,
      actorUserId: ALICE,
      actorName: "Alice",
      matchup: "Barcelona at Real Madrid",
      selectionLabel: "Home",
      stake: 25,
    });

    // The actor is excluded at the repository level, not filtered afterwards.
    expect(listNotifiableMembers).toHaveBeenCalledWith(GROUP_A, ALICE);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const message = sendEmail.mock.calls[0]![0];
    expect(message.to).toBe("bob@example.com");
    expect(message.subject).toContain("Alice");
    expect(message.text).toContain("25");
    expect(message.text).toContain(
      "https://plan-bet.example/groups/sunday-league",
    );
  });

  it("sends nothing when nobody is opted in", async () => {
    listNotifiableMembers.mockResolvedValue([]);

    await notifyGroupWagerPlaced({
      groupId: GROUP_A,
      actorUserId: ALICE,
      actorName: "Alice",
      matchup: "Barcelona at Real Madrid",
      selectionLabel: "Home",
      stake: 25,
    });

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("never rejects when a lookup fails, so placement is unaffected", async () => {
    listNotifiableMembers.mockRejectedValue(new Error("db down"));

    await expect(
      notifyGroupWagerPlaced({
        groupId: GROUP_A,
        actorUserId: ALICE,
        actorName: null,
        matchup: "Barcelona at Real Madrid",
        selectionLabel: "Home",
        stake: 25,
      }),
    ).resolves.toBeUndefined();
  });
});

describe("notifyGroupSettlements", () => {
  const members = [
    { userId: ALICE, email: "alice@example.com", name: "Alice" },
    { userId: BOB, email: "bob@example.com", name: "Bob" },
  ];

  it("sends one digest per member per run, not one per wager", async () => {
    listNotifiableMembers.mockResolvedValue(members);

    await notifyGroupSettlements([
      {
        groupId: GROUP_A,
        userId: ALICE,
        matchup: "Barcelona at Real Madrid",
        selectionLabel: "Home",
        outcome: "won",
        returned: 60,
      },
      {
        groupId: GROUP_A,
        userId: BOB,
        matchup: "Red Sox at Yankees",
        selectionLabel: "Over",
        outcome: "lost",
        returned: 0,
      },
    ]);

    expect(sendEmail).toHaveBeenCalledTimes(2);
    const toAlice = sendEmail.mock.calls.find(
      (call) => call[0].to === "alice@example.com",
    )![0];
    expect(toAlice.subject).toContain("2 wagers settled");
    // Each reader sees their own line in the second person.
    expect(toAlice.text).toContain("You won 60");
    expect(toAlice.text).toContain("Bob lost");
  });

  it("keeps each group's digest to that group's wagers", async () => {
    listNotifiableMembers.mockImplementation(async (groupId: string) =>
      groupId === GROUP_A ? [members[0]] : [members[1]],
    );

    await notifyGroupSettlements([
      {
        groupId: GROUP_A,
        userId: ALICE,
        matchup: "Barcelona at Real Madrid",
        selectionLabel: "Home",
        outcome: "won",
        returned: 60,
      },
      {
        groupId: GROUP_B,
        userId: BOB,
        matchup: "Red Sox at Yankees",
        selectionLabel: "Over",
        outcome: "void",
        returned: 25,
      },
    ]);

    const aliceText = sendEmail.mock.calls.find(
      (call) => call[0].to === "alice@example.com",
    )![0].text;
    expect(aliceText).toContain("Barcelona at Real Madrid");
    expect(aliceText).not.toContain("Red Sox at Yankees");

    const bobMessage = sendEmail.mock.calls.find(
      (call) => call[0].to === "bob@example.com",
    )![0];
    expect(bobMessage.subject).toContain("1 wager settled");
    expect(bobMessage.text).toContain("voided");
  });

  it("does nothing at all for an empty run", async () => {
    await notifyGroupSettlements([]);
    expect(listGroupsByIds).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
