import { describe, expect, it, vi } from "vitest";
import { OpenAiClient, ProviderError } from "@/providers/openai/client";

const clientFor = (fetcher: typeof fetch) =>
  new OpenAiClient({ apiKey: "test-key", model: "test-model", fetch: fetcher });

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
