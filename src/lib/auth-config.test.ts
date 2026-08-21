import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { isDatabaseConfiguredMock } = vi.hoisted(() => ({
  isDatabaseConfiguredMock: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  isDatabaseConfigured: isDatabaseConfiguredMock,
}));

const { isAuthConfigured, configuredProviderNames, isTrustedProviderEmail } =
  await import("@/lib/auth-config");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe("isAuthConfigured", () => {
  it("is true only when AUTH_SECRET is set and the database is configured", () => {
    isDatabaseConfiguredMock.mockReturnValue(true);
    vi.stubEnv("AUTH_SECRET", "shh");
    expect(isAuthConfigured()).toBe(true);
  });

  it("is false without AUTH_SECRET even when the database is configured", () => {
    isDatabaseConfiguredMock.mockReturnValue(true);
    vi.stubEnv("AUTH_SECRET", "");
    expect(isAuthConfigured()).toBe(false);
  });

  it("is false without a configured database even when AUTH_SECRET is set", () => {
    isDatabaseConfiguredMock.mockReturnValue(false);
    vi.stubEnv("AUTH_SECRET", "shh");
    expect(isAuthConfigured()).toBe(false);
  });
});

describe("configuredProviderNames", () => {
  // Every case below needs sign-in itself viable; the gate is asserted on its
  // own in the last test.
  beforeEach(() => {
    isDatabaseConfiguredMock.mockReturnValue(true);
    vi.stubEnv("AUTH_SECRET", "shh");
  });

  it("returns no providers when no credentials are configured", () => {
    vi.stubEnv("AUTH_GITHUB_ID", "");
    vi.stubEnv("AUTH_GITHUB_SECRET", "");
    vi.stubEnv("AUTH_GOOGLE_ID", "");
    vi.stubEnv("AUTH_GOOGLE_SECRET", "");
    expect(configuredProviderNames()).toEqual([]);
  });

  it("requires both the id and the secret for a provider", () => {
    vi.stubEnv("AUTH_GITHUB_ID", "id");
    vi.stubEnv("AUTH_GITHUB_SECRET", "");
    expect(configuredProviderNames()).toEqual([]);

    vi.stubEnv("AUTH_GITHUB_SECRET", "secret");
    expect(configuredProviderNames()).toEqual(["github"]);
  });

  it("lists both providers when both are fully credentialed", () => {
    vi.stubEnv("AUTH_GITHUB_ID", "id");
    vi.stubEnv("AUTH_GITHUB_SECRET", "secret");
    vi.stubEnv("AUTH_GOOGLE_ID", "id");
    vi.stubEnv("AUTH_GOOGLE_SECRET", "secret");
    expect(configuredProviderNames()).toEqual(["github", "google"]);
  });

  it("lists nothing when sign-in itself is unconfigured, however well credentialed the providers are", () => {
    vi.stubEnv("AUTH_GITHUB_ID", "id");
    vi.stubEnv("AUTH_GITHUB_SECRET", "secret");
    vi.stubEnv("AUTH_GOOGLE_ID", "id");
    vi.stubEnv("AUTH_GOOGLE_SECRET", "secret");

    vi.stubEnv("AUTH_SECRET", "");
    expect(configuredProviderNames()).toEqual([]);

    vi.stubEnv("AUTH_SECRET", "shh");
    isDatabaseConfiguredMock.mockReturnValue(false);
    expect(configuredProviderNames()).toEqual([]);
  });
});

describe("isTrustedProviderEmail", () => {
  // Both providers link on a shared email, so this predicate is the only thing
  // standing between an unverified address and an existing account.
  it("accepts Google only when it states the address is verified", () => {
    expect(isTrustedProviderEmail("google", { email_verified: true })).toBe(
      true,
    );
    expect(isTrustedProviderEmail("google", { email_verified: false })).toBe(
      false,
    );
    expect(isTrustedProviderEmail("google", {})).toBe(false);
  });

  it("requires the literal boolean, never a truthy stand-in", () => {
    expect(isTrustedProviderEmail("google", { email_verified: "true" })).toBe(
      false,
    );
    expect(isTrustedProviderEmail("google", { email_verified: 1 })).toBe(false);
  });

  it("rejects Google when no profile came back at all", () => {
    expect(isTrustedProviderEmail("google", null)).toBe(false);
    expect(isTrustedProviderEmail("google", undefined)).toBe(false);
  });

  it("accepts GitHub, which vouches for its own primary email", () => {
    expect(isTrustedProviderEmail("github", undefined)).toBe(true);
    expect(isTrustedProviderEmail("github", { email_verified: false })).toBe(
      true,
    );
  });
});
