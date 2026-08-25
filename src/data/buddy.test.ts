import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  boardFacts,
  prepareBuddyTurn,
  resolveContext,
  threadFacts,
} from "@/data/buddy";
import type { CommentThread } from "@/data/game-comments";
import { getSnapshot } from "@/lib/seed";
import { marketsFor } from "@/lib/markets";
import type { GameComment } from "@/lib/contracts";

function boardRow(overrides: { canonicalId?: string; summary?: string } = {}) {
  return {
    canonicalId: overrides.canonicalId ?? "football-data-564645",
    game: {
      id: "football-data-564645",
      sport: "soccer" as const,
      teamSlug: "real-madrid" as const,
      competition: "La Liga",
      homeTeam: "Real Madrid",
      awayTeam: "Barcelona",
      scheduledAt: "2026-09-01T19:00:00.000Z",
      status: "scheduled" as const,
    },
    summary: overrides.summary ?? "Real Madrid vs Barcelona. Injuries: none.",
  };
}

const GAME_ID = "soc-rma-01";
const original = { ...process.env };

function restore() {
  for (const key of ["DATABASE_URL", "OPENAI_API_KEY", "MATCHDAY_DATA_MODE"]) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
}

function factId() {
  return getSnapshot(GAME_ID)!.evidenceFacts[0]!.id;
}

function sseOf(text: string) {
  return new Response(
    `data: ${JSON.stringify({ type: "response.output_text.delta", delta: text })}\n\n` +
      `data: ${JSON.stringify({ type: "response.completed", response: { model: "test-model", usage: { input_tokens: 10, output_tokens: 5 } } })}\n\n`,
  );
}

const request = {
  conversation: "22222222-2222-4222-8222-222222222222",
  route: `/games/${GAME_ID}`,
  question: "who do you like here?",
  history: [],
  sessionId: "11111111-1111-4111-8111-111111111111",
  clientAddressHash: "hash",
  requestId: "test-request",
};

async function collect(run: () => AsyncGenerator<unknown>) {
  const events = [];
  for await (const event of run()) events.push(event);
  return events;
}

beforeEach(() => {
  delete process.env.DATABASE_URL;
  process.env.MATCHDAY_DATA_MODE = "demo";
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  restore();
  vi.restoreAllMocks();
});

describe("resolveContext", () => {
  it("grounds a game route in the snapshot's own evidence and markets", async () => {
    const { context, routeLabel } = await resolveContext(
      `/games/${GAME_ID}`,
      {},
    );
    expect(context.kind).toBe("game");
    expect(routeLabel).toBe(`game:${GAME_ID}`);
    if (context.kind === "game") {
      expect(context.facts.length).toBeGreaterThan(0);
      expect(context.allowedPickIds).toEqual(
        marketsFor("soccer").flatMap((m) =>
          m.selections.map((s) => `${m.id}:${s.id}`),
        ),
      );
    }
  });

  it("never discloses a signed-out viewer's record or a route it can't resolve", async () => {
    expect((await resolveContext("/you", {})).context).toEqual({
      kind: "none",
    });
    expect((await resolveContext("/rules", {})).context).toEqual({
      kind: "none",
    });
  });
});

describe("boardFacts", () => {
  it("keys each fact on recall-<canonicalId> and carries the stored summary", () => {
    const facts = boardFacts([boardRow()]);
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      id: "recall-football-data-564645",
      label: "Real Madrid vs Barcelona",
      value: "Real Madrid vs Barcelona. Injuries: none.",
      valueType: "text",
    });
  });

  it("drops a row whose stored GameSummary doesn't parse, rather than guessing, and keeps the rest", () => {
    // Missing `homeTeam` fails gameSummarySchema; that row must be skipped
    // while a valid row alongside it still comes through.
    const broken = boardRow({ canonicalId: "football-data-999" });
    const facts = boardFacts([
      { ...broken, game: { ...broken.game, homeTeam: undefined } },
      boardRow(),
    ]);
    expect(facts).toHaveLength(1);
    expect(facts[0]?.id).toBe("recall-football-data-564645");
  });

  it("returns [] for an empty board", () => {
    expect(boardFacts([])).toEqual([]);
  });
});

function comment(
  overrides: Partial<GameComment> & { id: string },
): GameComment {
  return {
    groupId: "group-1",
    userId: "user-1",
    authorName: "Dani",
    authorSelectionLabel: "Home",
    phase: "before",
    body: "Taking the over",
    createdAt: "2026-01-01T00:00:00.000Z",
    shameVotes: 0,
    slanderVotes: 0,
    viewerVoted: [],
    ...overrides,
  };
}

function thread(comments: GameComment[]): CommentThread {
  return { groupId: "group-1", groupName: "Sunday League", comments };
}

describe("threadFacts", () => {
  it("returns [] for an empty thread", () => {
    expect(threadFacts(thread([]))).toEqual([]);
  });

  it("makes one fact per comment, labelled with the author and their side", () => {
    const facts = threadFacts(
      thread([
        comment({
          id: "comment-1",
          authorName: "Dani",
          authorSelectionLabel: "Home",
          body: "Taking the over",
        }),
        comment({
          id: "comment-2",
          authorName: "Sam",
          authorSelectionLabel: "Away",
          body: "No chance",
        }),
      ]),
    );
    expect(facts).toHaveLength(2);
    expect(facts[0]).toMatchObject({
      id: "thread-0",
      label: "Dani (Home)",
      value: "Taking the over",
    });
    expect(facts[1]).toMatchObject({
      id: "thread-1",
      label: "Sam (Away)",
      value: "No chance",
    });
  });

  it("adds a pin fact for whichever side has one, and only that side", () => {
    const facts = threadFacts(
      thread([
        comment({
          id: "comment-1",
          authorName: "Dani",
          body: "Taking the over",
          shameVotes: 3,
        }),
      ]),
    );
    expect(facts.map((f) => f.id)).toEqual(["thread-0", "thread-pin-shame"]);
    expect(facts[1]).toMatchObject({
      label: "Pin of shame",
      value: "Dani: Taking the over",
    });
  });
});

describe("prepareBuddyTurn", () => {
  it("answers from the facts alone, unmetered, when AI isn't configured", async () => {
    delete process.env.OPENAI_API_KEY;
    const preflight = await prepareBuddyTurn({ ...request, fetch: vi.fn() });
    expect(preflight.status).toBe("ready");
    if (preflight.status !== "ready") return;
    const events = await collect(preflight.run);
    expect(events.at(-1)).toMatchObject({ type: "done", ok: true });
    expect(events[0]).toMatchObject({ type: "delta" });
  });

  it("streams a grounded reply and confirms it on response.completed", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const fetcher = vi.fn(async () =>
      sseOf(
        `Lean this way here [${factId()}]. [pick: ${marketsFor("soccer")[0]!.id}:${marketsFor("soccer")[0]!.selections[0]!.id}]`,
      ),
    );
    const preflight = await prepareBuddyTurn({ ...request, fetch: fetcher });
    expect(preflight.status).toBe("ready");
    if (preflight.status !== "ready") return;
    const events = await collect(preflight.run);
    expect(events.at(-1)).toMatchObject({
      type: "done",
      ok: true,
      pickId: `${marketsFor("soccer")[0]!.id}:${marketsFor("soccer")[0]!.selections[0]!.id}`,
    });
  });

  it("retracts a streamed reply that fails validation, never leaving it standing", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const fetcher = vi.fn(async () =>
      sseOf(`This is a guaranteed winner [${factId()}].`),
    );
    const preflight = await prepareBuddyTurn({ ...request, fetch: fetcher });
    expect(preflight.status).toBe("ready");
    if (preflight.status !== "ready") return;
    const events = await collect(preflight.run);
    expect(events.at(-1)).toMatchObject({
      type: "done",
      ok: false,
      reason: "prohibited_language",
    });
    // A rejection carries no prose forward for the client to keep displaying.
    expect((events.at(-1) as { prose: string }).prose).toBe("");
  });
});
