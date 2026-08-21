import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appBaseUrl, sendEmail } from "@/lib/email";

const ENV_KEYS = [
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "NEXT_PUBLIC_SITE_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.restoreAllMocks();
});

describe("sendEmail", () => {
  it("is a no-op that never calls the provider when the key is unset", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    process.env.EMAIL_FROM = "plan@example.com";

    const result = await sendEmail({ to: "a@b.com", subject: "s", text: "t" });

    expect(result).toEqual({ sent: false, reason: "unconfigured" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is a no-op when the key is set but the sender is not", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    process.env.RESEND_API_KEY = "re_test";

    const result = await sendEmail({ to: "a@b.com", subject: "s", text: "t" });

    expect(result).toEqual({ sent: false, reason: "unconfigured" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts the message when configured", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "plan@example.com";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    const result = await sendEmail({
      to: "a@b.com",
      subject: "Settled",
      text: "body",
    });

    expect(result).toEqual({ sent: true });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      from: "plan@example.com",
      to: ["a@b.com"],
      subject: "Settled",
      text: "body",
    });
  });

  it("never throws when the provider rejects or errors", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "plan@example.com";

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 422 }),
    );
    await expect(
      sendEmail({ to: "a@b.com", subject: "s", text: "t" }),
    ).resolves.toEqual({ sent: false, reason: "failed" });

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("timeout"));
    await expect(
      sendEmail({ to: "a@b.com", subject: "s", text: "t" }),
    ).resolves.toEqual({ sent: false, reason: "failed" });
  });

  it("never logs the recipient address", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "plan@example.com";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 200 }),
    );
    const info = vi.mocked(console.info);

    await sendEmail({ to: "secret@person.com", subject: "s", text: "t" });

    expect(info.mock.calls.flat().join(" ")).not.toContain("secret@person.com");
  });
});

describe("appBaseUrl", () => {
  it("prefers the explicit site URL and trims a trailing slash", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://plan-bet.vercel.app/";
    expect(appBaseUrl()).toBe("https://plan-bet.vercel.app");
  });

  it("falls back to the Vercel production host, then localhost", () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "plan-bet.vercel.app";
    expect(appBaseUrl()).toBe("https://plan-bet.vercel.app");

    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    expect(appBaseUrl()).toBe("http://localhost:3000");
  });
});
