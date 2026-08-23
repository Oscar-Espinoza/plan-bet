import { describe, expect, it } from "vitest";
import { safeCallbackUrl } from "@/lib/api-request";

describe("safeCallbackUrl", () => {
  it("accepts an on-site path", () => {
    expect(safeCallbackUrl("/you")).toBe("/you");
  });

  it("rejects a protocol-relative URL", () => {
    expect(safeCallbackUrl("//evil.com")).toBe("/you");
  });

  it("rejects an absolute URL", () => {
    expect(safeCallbackUrl("https://evil.com")).toBe("/you");
  });

  // Regression: a startsWith("//") check let all of these through, and the
  // WHATWG URL parser (so every browser) resolves them to evil.com.
  it.each([
    ["backslash", "/\\evil.com"],
    ["double backslash", "\\\\evil.com"],
    ["embedded carriage return", "/\r/evil.com"],
    ["embedded newline", "/\n/evil.com"],
  ])("rejects an off-site URL disguised by a %s", (_label, value) => {
    expect(safeCallbackUrl(value)).toBe("/you");
  });

  it("keeps the query and fragment of an on-site path", () => {
    expect(safeCallbackUrl("/games/soc-rma-01?tab=evidence#top")).toBe(
      "/games/soc-rma-01?tab=evidence#top",
    );
  });

  it("falls back to /you when the value is missing or empty", () => {
    expect(safeCallbackUrl(undefined)).toBe("/you");
    expect(safeCallbackUrl("")).toBe("/you");
  });
});
