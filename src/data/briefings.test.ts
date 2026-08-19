import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateBriefing } from "@/data/briefings";
import { getSnapshot } from "@/lib/seed";

const GAME_ID = "soc-rma-01";
const original = { ...process.env };

function restore() {
  for (const key of ["DATABASE_URL", "OPENAI_API_KEY", "MATCHDAY_DATA_MODE"]) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
}

function factIds() {
  return getSnapshot(GAME_ID)!.evidenceFacts.map((fact) => fact.id);
}

const ITEM_TEXTS = [
  "Recent results across the last five outings are reported in the snapshot.",
  "League position and accumulated points come straight from the standings feed.",
  "Kick-off time and venue are fixed by the schedule entry.",
  "Squad availability is listed only where the source states it explicitly.",
  "The matchup note records how these two sides have met before.",
];

function output(evidenceIds: string[]) {
  const categories = ["Form", "Standing", "Setting", "Availability", "Matchup"];
  return {
    summary: "Preparation notes drawn from the stored snapshot.",
    items: evidenceIds.slice(0, 5).map((id, index) => ({
      category: categories[index]!,
      text: ITEM_TEXTS[index]!,
      evidenceIds: [id],
      timestampEvidenceId: "",
    })),
    limitations: ["Confirmed lineups are not in the supplied evidence."],
  };
}

function responseFor(body: unknown) {
  return new Response(
    JSON.stringify({
      model: "test-model",
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(body) }],
        },
      ],
      usage: { input_tokens: 100, output_tokens: 200 },
    }),
  );
}

const request = {
  gameId: GAME_ID,
  sessionId: "11111111-1111-4111-8111-111111111111",
  clientAddressHash: "hash",
  watchlist: ["Confirm the starting lineup"],
  requestId: "test-request",
};

beforeEach(() => {
  delete process.env.DATABASE_URL;
  process.env.MATCHDAY_DATA_MODE = "demo";
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  restore();
  vi.restoreAllMocks();
});

describe("grounded briefing generation", () => {
  it("returns the deterministic fallback without calling OpenAI when unconfigured", async () => {
    delete process.env.OPENAI_API_KEY;
    const fetcher = vi.fn();

    const outcome = await generateBriefing({ ...request, fetch: fetcher });

    expect(fetcher).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({
      status: "ok",
      result: { mode: "fallback", reason: "ai_unconfigured" },
    });
    expect(outcome.status === "ok" && outcome.result.briefing.mode).toBe(
      "fallback",
    );
    expect(
      outcome.status === "ok" && outcome.result.briefing.limitations[0],
    ).toContain("AI generation is not configured");
  });

  it("names the cause inside every fallback briefing so a reload still shows it", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const cases = [
      [
        async () => new Response("{}", { status: 503 }),
        "The model was unreachable",
      ],
      [
        async () => new Response("{}", { status: 429 }),
        "The model rate limit was reached",
      ],
      [
        async () => {
          throw new DOMException("timed out", "TimeoutError");
        },
        "The model did not respond in time",
      ],
    ] as const;

    for (const [fetcher, expected] of cases) {
      const outcome = await generateBriefing({
        ...request,
        fetch: vi.fn(fetcher),
      });
      expect(outcome.status).toBe("ok");
      if (outcome.status !== "ok") return;
      expect(outcome.result.briefing.limitations[0]).toContain(expected);
      // The stale generic line never survives alongside a real reason.
      expect(outcome.result.briefing.limitations.join(" ")).not.toContain(
        "not live AI generation",
      );
    }
  });

  it("leaves a live briefing free of any fallback explanation", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const ids = factIds();
    const fetcher = vi.fn(async () => responseFor(output(ids)));

    const outcome = await generateBriefing({ ...request, fetch: fetcher });

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.result.briefing.limitations.join(" ")).not.toMatch(
      /deterministic evidence brief was served|not configured/,
    );
  });

  it("returns a live briefing whose every item cites supplied evidence", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const ids = factIds();
    const fetcher = vi.fn(async () => responseFor(output(ids)));

    const outcome = await generateBriefing({ ...request, fetch: fetcher });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.result.mode).toBe("live");
    expect(outcome.result.briefing.mode).toBe("ai");
    expect(outcome.result.briefing.items).toHaveLength(5);
    for (const item of outcome.result.briefing.items) {
      expect(item.evidenceIds.length).toBeGreaterThan(0);
      expect(ids).toEqual(expect.arrayContaining(item.evidenceIds));
    }
    expect(outcome.result.briefing.generation).toMatchObject({
      model: "test-model",
      schemaVersion: "1",
    });
  });

  it("resolves a time token into a timestamp the browser can localize", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const ids = factIds();
    const timed = output(ids);
    timed.items[0]!.text = "Real Madrid host their next opponent on {time}.";
    timed.items[0]!.timestampEvidenceId = ids[0]!;
    const fetcher = vi.fn(async () => responseFor(timed));

    const outcome = await generateBriefing({ ...request, fetch: fetcher });

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    const [first] = outcome.result.briefing.items;
    const scheduled = getSnapshot(GAME_ID)!.evidenceFacts[0]!.value;
    expect(first!.timestamp).toBe(scheduled);
    // The prose still carries the token, never the timestamp itself.
    expect(first!.text).toContain("{time}");
    expect(first!.text).not.toContain(scheduled);
  });

  it("rejects a briefing that writes the date itself", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const written = output(factIds());
    written.items[1]!.text = "Kick-off is 2026-08-30 at 15:00 UTC.";
    const fetcher = vi.fn(async () => responseFor(written));

    const outcome = await generateBriefing({ ...request, fetch: fetcher });

    expect(outcome).toMatchObject({
      status: "ok",
      result: { mode: "fallback", reason: "validation_failed" },
    });
  });

  it("repairs once when citations are unsupported and then succeeds", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const ids = factIds();
    const invalid = output(ids);
    invalid.items[0]!.evidenceIds = ["fabricated-fact"];
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(responseFor(invalid))
      .mockResolvedValueOnce(responseFor(output(ids)));

    const outcome = await generateBriefing({ ...request, fetch: fetcher });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(outcome).toMatchObject({ status: "ok", result: { mode: "live" } });
  });

  it("falls back after exactly one retry when validation keeps failing", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const invalid = output(factIds());
    invalid.items[0]!.evidenceIds = ["fabricated-fact"];
    const fetcher = vi.fn(async () => responseFor(invalid));

    const outcome = await generateBriefing({ ...request, fetch: fetcher });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(outcome).toMatchObject({
      status: "ok",
      result: { mode: "fallback", reason: "validation_failed" },
    });
  });

  it("never returns AI prose that fails the prediction check", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const tipping = output(factIds());
    tipping.items[1]!.text = "Real Madrid will win, so the odds look generous.";
    const fetcher = vi.fn(async () => responseFor(tipping));

    const outcome = await generateBriefing({ ...request, fetch: fetcher });

    expect(outcome).toMatchObject({
      status: "ok",
      result: { mode: "fallback", reason: "validation_failed" },
    });
  });

  it.each([
    [503, "provider_unavailable"],
    [429, "provider_rate_limited"],
  ] as const)(
    "falls back to the saved briefing on HTTP %s",
    async (status, reason) => {
      process.env.OPENAI_API_KEY = "test-key";
      const fetcher = vi.fn(async () => new Response("{}", { status }));

      const outcome = await generateBriefing({ ...request, fetch: fetcher });

      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(outcome).toMatchObject({
        status: "ok",
        result: { mode: "fallback", reason },
      });
      expect(
        outcome.status === "ok" && outcome.result.briefing.items.length,
      ).toBeGreaterThanOrEqual(5);
    },
  );

  it("falls back when the provider times out", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const fetcher = vi.fn(async () => {
      throw new DOMException("timed out", "TimeoutError");
    });

    const outcome = await generateBriefing({ ...request, fetch: fetcher });

    expect(outcome).toMatchObject({
      status: "ok",
      result: { mode: "fallback", reason: "provider_timeout" },
    });
  });

  it("reports an unknown game without contacting the provider", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const fetcher = vi.fn();

    const outcome = await generateBriefing({
      ...request,
      gameId: "no-such-game",
      fetch: fetcher,
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(outcome).toEqual({ status: "not_found" });
  });
});
