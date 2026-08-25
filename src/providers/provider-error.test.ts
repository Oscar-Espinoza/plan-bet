import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ProviderError, providerErrorCode } from "@/providers/provider-error";

describe("providerErrorCode", () => {
  it("passes a ProviderError's own code through", () => {
    expect(
      providerErrorCode(
        new ProviderError("rate_limited", "slow down", "mcp:get_standings"),
      ),
    ).toBe("rate_limited");
  });

  it("reports a Zod failure as invalid_payload, not persistence_error", () => {
    const parsed = z.object({ table: z.array(z.string()) }).safeParse({
      table: "not an array",
    });
    expect(parsed.success).toBe(false);
    expect(providerErrorCode(parsed.error)).toBe("invalid_payload");
  });

  it("still falls back to persistence_error for anything else", () => {
    expect(providerErrorCode(new TypeError("boom"))).toBe("persistence_error");
    expect(providerErrorCode("a thrown string")).toBe("persistence_error");
  });
});
