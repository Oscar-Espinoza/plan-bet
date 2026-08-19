import { describe, expect, it, vi } from "vitest";
import fixture from "@/providers/openai/__fixtures__/briefing-response.json";
import { OpenAiClient, ProviderError } from "@/providers/openai/client";

const request = {
  operation: "briefing_generation",
  instructions: "instructions",
  input: "input",
  schema: { type: "object" },
};

const clientFor = (fetcher: typeof fetch) =>
  new OpenAiClient({ apiKey: "test-key", model: "test-model", fetch: fetcher });

describe("openai client", () => {
  it("returns the assistant text and usage from a completed response", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(fixture)));
    const completion = await clientFor(fetcher).createBriefing(request);

    expect(completion).toMatchObject({
      model: "gpt-5.6-luna",
      inputTokens: 812,
      outputTokens: 344,
    });
    expect(JSON.parse(completion.text)).toMatchObject({ summary: "fixture" });
  });

  it("requests structured output without tools or retention", async () => {
    let sent = "";
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      sent = String(init?.body);
      return new Response(JSON.stringify(fixture));
    });
    await clientFor(fetcher as unknown as typeof fetch).createBriefing(request);

    const body = JSON.parse(sent);
    expect(body).toMatchObject({
      model: "test-model",
      tools: [],
      store: false,
      text: {
        format: { type: "json_schema", name: "briefing", strict: true },
      },
    });
  });

  it("throws when the credential is missing", () => {
    expect(() => new OpenAiClient({ apiKey: " " })).toThrow(ProviderError);
  });

  it.each([
    [401, "unauthorized"],
    [403, "unauthorized"],
    [429, "rate_limited"],
    [503, "unavailable"],
    [400, "unavailable"],
  ] as const)("maps HTTP %s to %s", async (status, code) => {
    const fetcher = vi.fn(async () => new Response("{}", { status }));
    await expect(
      clientFor(fetcher).createBriefing(request),
    ).rejects.toMatchObject({
      code,
    });
  });

  it("maps aborts to timeout", async () => {
    const fetcher = vi.fn(async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    await expect(
      clientFor(fetcher).createBriefing(request),
    ).rejects.toMatchObject({
      code: "timeout",
    });
  });

  it("rejects oversized responses before parsing", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response("{}", { headers: { "content-length": "200001" } }),
    );
    await expect(
      clientFor(fetcher).createBriefing(request),
    ).rejects.toMatchObject({
      code: "invalid_payload",
    });
  });

  it("rejects malformed JSON, refusals, and incomplete responses", async () => {
    const malformed = vi.fn(async () => new Response("not-json"));
    await expect(
      clientFor(malformed).createBriefing(request),
    ).rejects.toMatchObject({ code: "invalid_payload" });

    const refused = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            model: "test-model",
            status: "completed",
            output: [
              {
                type: "message",
                content: [{ type: "refusal", refusal: "no" }],
              },
            ],
          }),
        ),
    );
    await expect(
      clientFor(refused).createBriefing(request),
    ).rejects.toMatchObject({ code: "invalid_payload" });

    const incomplete = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            model: "test-model",
            status: "incomplete",
            output: [],
          }),
        ),
    );
    await expect(
      clientFor(incomplete).createBriefing(request),
    ).rejects.toMatchObject({ code: "invalid_payload" });
  });

  it("never leaks the credential through an error", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 401 }));
    const error = await clientFor(fetcher)
      .createBriefing(request)
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ProviderError);
    expect(String(error)).not.toContain("test-key");
  });
});
