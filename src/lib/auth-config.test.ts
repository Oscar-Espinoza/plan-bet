import { afterEach, describe, expect, it, vi } from "vitest";

const { isDatabaseConfiguredMock } = vi.hoisted(() => ({
  isDatabaseConfiguredMock: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  isDatabaseConfigured: isDatabaseConfiguredMock,
}));

const { isAuthConfigured, configuredProviderNames } =
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
});
