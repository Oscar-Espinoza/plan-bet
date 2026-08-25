import { describe, expect, it } from "vitest";
import { callMcpTool } from "@/providers/mcp-http";
import { ProviderError, providerErrorCode } from "@/providers/provider-error";

const server = { url: "https://mcp.example/test", token: "test-token" };

/** A response whose headers arrive but whose body never finishes — the shape
 * a slow MCP server produces once the abort signal fires mid-stream. */
function stalledBody(name: string) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    text: () => {
      const error = new Error("The operation was aborted");
      error.name = name;
      return Promise.reject(error);
    },
  } as unknown as Response;
}

describe("callMcpTool body reads", () => {
  it("reports a timeout during the body read as a timeout, not a persistence failure", async () => {
    const error = await callMcpTool(
      server,
      "get_football_standings",
      {},
      { fetch: () => Promise.resolve(stalledBody("TimeoutError")) },
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).code).toBe("timeout");
    // The whole point: this used to surface as "persistence_error".
    expect(providerErrorCode(error)).toBe("timeout");
  });

  it("reports any other body-read failure as unavailable", async () => {
    const error = await callMcpTool(
      server,
      "get_football_standings",
      {},
      { fetch: () => Promise.resolve(stalledBody("TypeError")) },
    ).catch((caught: unknown) => caught);

    expect((error as ProviderError).code).toBe("unavailable");
  });
});
