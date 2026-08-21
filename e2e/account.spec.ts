import { expect, test, type Page } from "@playwright/test";

test("/sign-in renders the unavailable panel on the keyless server with no page error", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/sign-in");
  await expect(
    page.getByRole("heading", { name: "Sign-in unavailable" }),
  ).toBeVisible();
  expect(browserErrors).toEqual([]);
});

// Scoped to main because Next.js renders a permanently empty route-announcer
// with role="alert" outside it on every page.
const signInAlert = (page: Page) => page.locator("main").getByRole("alert");

test("/sign-in explains a failed sign-in instead of looking untouched", async ({
  page,
}) => {
  await page.goto("/sign-in?error=OAuthAccountNotLinked");
  await expect(signInAlert(page)).toContainText(
    "already connected to a different Matchday Plan account",
  );
  // The raw code is Auth.js internals; the reader gets plain language only.
  await expect(page.locator("body")).not.toContainText("OAuthAccountNotLinked");
});

test("/sign-in shows no alert when nothing failed", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(signInAlert(page)).toHaveCount(0);
});

test("the bets API never returns 200 with no session", async ({
  request,
  baseURL,
}) => {
  const summary = await request.get("/api/bets/summary");
  expect([401, 503]).toContain(summary.status());

  // Same-origin so the request clears isSameOrigin and reaches requireAccount.
  const origin = new URL(baseURL!).origin;
  const reset = await request.post("/api/bets/reset", {
    headers: { origin, "content-type": "application/json" },
    data: {},
  });
  expect([401, 503]).toContain(reset.status());
});

test("POST /api/bets/reset rejects a cross-origin request", async ({
  request,
}) => {
  const response = await request.post("/api/bets/reset", {
    headers: {
      origin: "https://evil.example",
      "content-type": "application/json",
    },
    data: {},
  });
  expect(response.status()).toBe(403);
});

// The keyless demo server has no DATABASE_URL, so isAuthConfigured() is
// false and there is no session to place a wager with (playwright.config.ts
// deviation 2 in the session 08 plan). What is provable here: the game page
// degrades cleanly with no wager form and no page error — the same
// "unconfigured" branch AccountControl already takes — and the placement
// route itself refuses with no session and rejects a cross-origin call.
test("the game page renders with no wager form and no page error on the keyless server", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/games/soc-rma-01");
  await expect(page.getByRole("button", { name: "Place wager" })).toHaveCount(
    0,
  );
  expect(browserErrors).toEqual([]);
});

test("POST /api/bets never returns 200 with no session", async ({
  request,
  baseURL,
}) => {
  // Same-origin so the request clears isSameOrigin and reaches requireAccount.
  const origin = new URL(baseURL!).origin;
  const response = await request.post("/api/bets", {
    headers: { origin, "content-type": "application/json" },
    data: {
      routeId: "soc-rma-01",
      marketId: "soccer-match-result",
      selectionId: "home",
      price: 2.4,
      stake: 10,
    },
  });
  expect([401, 503]).toContain(response.status());
});

test("POST /api/bets rejects a cross-origin request", async ({ request }) => {
  const response = await request.post("/api/bets", {
    headers: {
      origin: "https://evil.example",
      "content-type": "application/json",
    },
    data: {
      routeId: "soc-rma-01",
      marketId: "soccer-match-result",
      selectionId: "home",
      price: 2.4,
      stake: 10,
    },
  });
  expect(response.status()).toBe(403);
});

// /bets now redirects to /you, which in turn redirects to /sign-in on the
// keyless demo server (no DATABASE_URL, so requireAccount() reports
// "unconfigured"). This asserts the contract only — a real page (h1 + main
// landmark) at the end of that chain, no crash, no blank screen — never a
// specific sentence. Full axe coverage for /you lives in
// accessibility.spec.ts.
test("/bets redirects through /you to a real page in keyless demo mode with no page error", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));

  const response = await page.goto("/bets");
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
  expect(browserErrors).toEqual([]);
});

// CRON_SECRET may or may not be set in this environment (playwright.config.ts
// only blanks DATABASE_URL/FOOTBALL_DATA_API_TOKEN/OPENAI_API_KEY), so the
// route can honestly answer either "not configured" (503) or "unauthorized"
// (401) with no bearer — it must never answer 200.
test("POST /api/cron/settle never returns 200 without a valid bearer secret", async ({
  request,
}) => {
  const response = await request.post("/api/cron/settle");
  expect([401, 503]).toContain(response.status());
});

test("anonymous evidence-brief state survives reload and matchday-plan:v1 stays version 2", async ({
  page,
}) => {
  await page.goto("/games/soc-rma-01");
  await page
    .getByRole("button", { name: /View demo brief|Generate briefing/ })
    .click();
  await expect(page.getByText("Data used")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Data used")).toBeVisible();

  const stored = await page.evaluate(() =>
    localStorage.getItem("matchday-plan:v1"),
  );
  expect(stored).not.toBeNull();
  expect(JSON.parse(stored!).version).toBe(2);
});
