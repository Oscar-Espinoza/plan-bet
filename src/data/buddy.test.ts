import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prepareBuddyTurn, resolveContext } from "@/data/buddy";
import { getSnapshot } from "@/lib/seed";
import { marketsFor } from "@/lib/markets";

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
