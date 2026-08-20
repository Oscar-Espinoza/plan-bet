import { expect, test } from "@playwright/test";

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
