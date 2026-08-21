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

test("anonymous watchlist state survives reload and matchday-plan:v1 stays version 1", async ({
  page,
}) => {
  await page.goto("/games/soc-rma-01");
  await page
    .getByLabel("Preparation item")
    .fill("Confirm the anonymous flow still works");
  await page.getByRole("button", { name: "Add to watchlist" }).click();

  await page.reload();
  await page.getByRole("link", { name: "Watchlist" }).click();
  await expect(
    page.getByText("Confirm the anonymous flow still works", {
      exact: true,
    }),
  ).toBeVisible();

  const stored = await page.evaluate(() =>
    localStorage.getItem("matchday-plan:v1"),
  );
  expect(stored).not.toBeNull();
  expect(JSON.parse(stored!).version).toBe(1);
});
