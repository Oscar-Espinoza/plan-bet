import { afterEach, describe, expect, it, vi } from "vitest";

const { withDatabaseTransactionMock } = vi.hoisted(() => ({
  withDatabaseTransactionMock: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  withDatabaseTransaction: withDatabaseTransactionMock,
}));

const { createGroup, inviteToGroup, acceptGroupInvite } =
  await import("@/data/groups");

// Same minimal thenable-chain Proxy as src/data/wagers.test.ts.
function chain(rows: unknown[] = []) {
  const promise = Promise.resolve(rows);
  const handler: ProxyHandler<() => void> = {
    get(_target, prop) {
      if (prop === "then") return promise.then.bind(promise);
      if (prop === "catch") return promise.catch.bind(promise);
      if (prop === "finally") return promise.finally.bind(promise);
      return () => proxy;
    },
  };
  const proxy: unknown = new Proxy(() => undefined, handler);
  return proxy;
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("createGroup", () => {
  it("slugifies the name and creates an owner membership", async () => {
    const groupRow = {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Sunday League",
      slug: "sunday-league",
      createdByUserId: "33333333-3333-4333-8333-333333333333",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    const groupReturning = vi.fn().mockReturnValue(chain([groupRow]));
    const memberValues = vi.fn().mockReturnValue(chain([]));
    let insertCallCount = 0;
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockReturnValue(chain([])), // no slug collision
      insert: vi.fn(() => {
        insertCallCount += 1;
        return insertCallCount === 1
          ? { values: () => ({ returning: groupReturning }) }
          : { values: memberValues };
      }),
    };
    withDatabaseTransactionMock.mockImplementation(
      (work: (transaction: unknown) => unknown) => work(transaction),
    );

    const result = await createGroup({
      userId: "33333333-3333-4333-8333-333333333333",
      name: "Sunday League",
    });

    expect(result).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Sunday League",
      slug: "sunday-league",
      createdByUserId: "33333333-3333-4333-8333-333333333333",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(memberValues).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: "11111111-1111-4111-8111-111111111111",
        userId: "33333333-3333-4333-8333-333333333333",
        role: "owner",
      }),
    );
  });

  it("retries with a suffix when the base slug is already taken", async () => {
    const groupRow = {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Sunday League",
      slug: "sunday-league-abc123",
      createdByUserId: "33333333-3333-4333-8333-333333333333",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    const groupReturning = vi.fn().mockReturnValue(chain([groupRow]));
    let insertCallCount = 0;
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi
        .fn()
        .mockReturnValueOnce(chain([{ id: "existing" }])) // base slug taken
        .mockReturnValue(chain([])), // suffixed slug free
      insert: vi.fn(() => {
        insertCallCount += 1;
        return insertCallCount === 1
          ? { values: () => ({ returning: groupReturning }) }
          : { values: vi.fn().mockReturnValue(chain([])) };
      }),
    };
    withDatabaseTransactionMock.mockImplementation(
      (work: (transaction: unknown) => unknown) => work(transaction),
    );

    await createGroup({
      userId: "33333333-3333-4333-8333-333333333333",
      name: "Sunday League",
    });

    expect(transaction.select).toHaveBeenCalledTimes(2);
  });
});

describe("inviteToGroup", () => {
  function mockTransaction({
    isMember,
    alreadyMember,
    inviteRow,
  }: {
    isMember: boolean;
    alreadyMember: boolean;
    inviteRow?: Record<string, unknown>;
  }) {
    const insertReturning = vi
      .fn()
      .mockReturnValue(chain(inviteRow ? [inviteRow] : []));
    const transaction = {
      select: vi
        .fn()
        .mockReturnValueOnce(
          chain(
            isMember
              ? [{ userId: "55555555-5555-4555-8555-555555555555" }]
              : [],
          ),
        )
        .mockReturnValueOnce(
          chain(
            alreadyMember
              ? [{ userId: "66666666-6666-4666-8666-666666666666" }]
              : [],
          ),
        ),
      insert: vi.fn(() => ({ values: () => ({ returning: insertReturning }) })),
    };
    withDatabaseTransactionMock.mockImplementation(
      (work: (transaction: unknown) => unknown) => work(transaction),
    );
    return { transaction };
  }

  it("rejects an inviter who is not a member, without inserting anything", async () => {
    const { transaction } = mockTransaction({
      isMember: false,
      alreadyMember: false,
    });

    const result = await inviteToGroup({
      groupId: "11111111-1111-4111-8111-111111111111",
      invitedByUserId: "55555555-5555-4555-8555-555555555555",
      email: "friend@example.com",
    });

    expect(result).toEqual({ ok: false, reason: "not_a_member" });
    expect(transaction.insert).not.toHaveBeenCalled();
  });

  it("rejects an email that already belongs to a member", async () => {
    const { transaction } = mockTransaction({
      isMember: true,
      alreadyMember: true,
    });

    const result = await inviteToGroup({
      groupId: "11111111-1111-4111-8111-111111111111",
      invitedByUserId: "55555555-5555-4555-8555-555555555555",
      email: "friend@example.com",
    });

    expect(result).toEqual({ ok: false, reason: "already_member" });
    expect(transaction.insert).not.toHaveBeenCalled();
  });

  it("inserts a pending invite expiring 7 days out", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const inviteRow = {
      id: "77777777-7777-4777-8777-777777777777",
      groupId: "11111111-1111-4111-8111-111111111111",
      email: "friend@example.com",
      status: "pending",
      createdAt: now,
      expiresAt: new Date("2026-01-08T00:00:00.000Z"),
    };
    mockTransaction({ isMember: true, alreadyMember: false, inviteRow });

    const result = await inviteToGroup({
      groupId: "11111111-1111-4111-8111-111111111111",
      invitedByUserId: "55555555-5555-4555-8555-555555555555",
      email: "friend@example.com",
      now,
    });

    expect(result).toEqual({
      ok: true,
      invite: {
        id: "77777777-7777-4777-8777-777777777777",
        groupId: "11111111-1111-4111-8111-111111111111",
        email: "friend@example.com",
        status: "pending",
        createdAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-01-08T00:00:00.000Z",
      },
    });
  });
});

describe("acceptGroupInvite", () => {
  function mockTransaction(invite: Record<string, unknown> | undefined) {
    const updateWhere = vi.fn().mockReturnValue(chain([]));
    const insertValues = vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockReturnValue(chain([])),
    });
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi
        .fn()
        .mockReturnValueOnce(chain(invite ? [invite] : []))
        .mockReturnValue(chain([{ slug: "sunday-league" }])),
      update: vi.fn(() => ({ set: () => ({ where: updateWhere }) })),
      insert: vi.fn(() => ({ values: insertValues })),
    };
    withDatabaseTransactionMock.mockImplementation(
      (work: (transaction: unknown) => unknown) => work(transaction),
    );
    return { transaction, updateWhere, insertValues };
  }

  it("returns not_found for a missing or already-used token", async () => {
    mockTransaction(undefined);

    const result = await acceptGroupInvite({
      token: "tok",
      userId: "44444444-4444-4444-8444-444444444444",
      userEmail: "friend@example.com",
    });

    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("marks an expired invite as expired and rejects it", async () => {
    const now = new Date("2026-01-10T00:00:00.000Z");
    const { transaction } = mockTransaction({
      id: "77777777-7777-4777-8777-777777777777",
      groupId: "11111111-1111-4111-8111-111111111111",
      email: "friend@example.com",
      status: "pending",
      expiresAt: new Date("2026-01-08T00:00:00.000Z"),
    });

    const result = await acceptGroupInvite({
      token: "tok",
      userId: "44444444-4444-4444-8444-444444444444",
      userEmail: "friend@example.com",
      now,
    });

    expect(result).toEqual({ ok: false, reason: "expired" });
    expect(transaction.update).toHaveBeenCalledTimes(1);
  });

  it("rejects when the signed-in email does not match the invite", async () => {
    mockTransaction({
      id: "77777777-7777-4777-8777-777777777777",
      groupId: "11111111-1111-4111-8111-111111111111",
      email: "friend@example.com",
      status: "pending",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    });

    const result = await acceptGroupInvite({
      token: "tok",
      userId: "44444444-4444-4444-8444-444444444444",
      userEmail: "someone-else@example.com",
    });

    expect(result).toEqual({ ok: false, reason: "email_mismatch" });
  });

  it("adds the member and marks the invite accepted on a match, case-insensitively", async () => {
    const { insertValues, transaction } = mockTransaction({
      id: "77777777-7777-4777-8777-777777777777",
      groupId: "11111111-1111-4111-8111-111111111111",
      email: "Friend@Example.com",
      status: "pending",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    });

    const result = await acceptGroupInvite({
      token: "tok",
      userId: "44444444-4444-4444-8444-444444444444",
      userEmail: "friend@example.com",
    });

    expect(result).toEqual({ ok: true, groupSlug: "sunday-league" });
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: "11111111-1111-4111-8111-111111111111",
        userId: "44444444-4444-4444-8444-444444444444",
        role: "member",
      }),
    );
    expect(transaction.update).toHaveBeenCalledTimes(1);
  });
});
