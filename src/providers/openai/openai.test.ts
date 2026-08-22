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
    const completion = await clientFor(fetcher).createStructured(request);

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
    await clientFor(fetcher as unknown as typeof fetch).createStructured(
      request,
    );

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
      clientFor(fetcher).createStructured(request),
    ).rejects.toMatchObject({
      code,
    });
  });

  it("maps aborts to timeout", async () => {
    const fetcher = vi.fn(async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    await expect(
      clientFor(fetcher).createStructured(request),
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
      clientFor(fetcher).createStructured(request),
    ).rejects.toMatchObject({
      code: "invalid_payload",
    });
  });

  it("rejects malformed JSON, refusals, and incomplete responses", async () => {
    const malformed = vi.fn(async () => new Response("not-json"));
    await expect(
      clientFor(malformed).createStructured(request),
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
      clientFor(refused).createStructured(request),
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
      clientFor(incomplete).createStructured(request),
    ).rejects.toMatchObject({ code: "invalid_payload" });
  });

  it("never leaks the credential through an error", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 401 }));
    const error = await clientFor(fetcher)
      .createStructured(request)
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ProviderError);
    expect(String(error)).not.toContain("test-key");
  });
});

const streamRequest = {
  operation: "buddy_turn",
  instructions: "instructions",
  input: "input",
};

function sseResponse(frames: string[], init: ResponseInit = {}) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
  return new Response(stream, init);
}

function frame(payload: unknown) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

async function collect(client: OpenAiClient) {
  const events = [];
  for await (const event of client.createStreaming(streamRequest)) {
    events.push(event);
  }
  return events;
}

describe("openai client streaming", () => {
  it("forwards deltas in order and terminates on response.completed", async () => {
    const fetcher = vi.fn(async () =>
      sseResponse([
        frame({ type: "response.output_text.delta", delta: "Real " }),
        frame({ type: "response.output_text.delta", delta: "Madrid." }),
        frame({
          type: "response.completed",
          response: {
            model: "test-model",
            usage: { input_tokens: 10, output_tokens: 5 },
          },
        }),
      ]),
    );

    const events = await collect(clientFor(fetcher));
    expect(events).toEqual([
      { type: "delta", text: "Real " },
      { type: "delta", text: "Madrid." },
      {
        type: "done",
        model: "test-model",
        inputTokens: 10,
        outputTokens: 5,
      },
    ]);
  });

  it("streams without a json_schema format", async () => {
    let sent = "";
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      sent = String(init?.body);
      return sseResponse([frame({ type: "response.completed", response: {} })]);
    });
    await collect(clientFor(fetcher as unknown as typeof fetch));

    const body = JSON.parse(sent);
    expect(body.stream).toBe(true);
    expect(body.text).toBeUndefined();
    expect(body.tools).toEqual([]);
    expect(body.store).toBe(false);
  });

  it("maps a refusal-shaped failure event to invalid_payload", async () => {
    const fetcher = vi.fn(async () =>
      sseResponse([frame({ type: "response.failed" })]),
    );
    await expect(collect(clientFor(fetcher))).rejects.toMatchObject({
      code: "invalid_payload",
    });
  });

  it("throws when the connection tears down before response.completed", async () => {
    const fetcher = vi.fn(async () =>
      sseResponse([
        frame({ type: "response.output_text.delta", delta: "partial" }),
      ]),
    );
    await expect(collect(clientFor(fetcher))).rejects.toMatchObject({
      code: "unavailable",
    });
  });

  it("enforces the response byte cap on the accumulated stream", async () => {
    const fetcher = vi.fn(async () =>
      sseResponse([
        frame({
          type: "response.output_text.delta",
          delta: "x".repeat(210_000),
        }),
      ]),
    );
    await expect(collect(clientFor(fetcher))).rejects.toMatchObject({
      code: "invalid_payload",
    });
  });

  it("never leaks the credential through a streaming error", async () => {
    const fetcher = vi.fn(async () => new Response("", { status: 401 }));
    const error = await collect(clientFor(fetcher)).catch(
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(ProviderError);
    expect(String(error)).not.toContain("test-key");
  });
});
