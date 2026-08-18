import { expect, test } from "@playwright/test";

test("Barcelona prep workflow persists, records activity, and resets safely", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem("portfolio:e2e-sentinel", "keep"),
  );
  await page.getByLabel("Selected team").selectOption("barcelona");
  await expect(
    page.getByRole("heading", { level: 1, name: "FC Barcelona" }),
  ).toBeVisible();

  await expect(page.locator(".game-row").first()).toBeVisible();
  await page.locator(".game-row").first().click();
  await expect(
    page.locator(".matchup-team-name").filter({ hasText: "FC Barcelona" }),
  ).toBeVisible();

  await page.getByLabel("Preparation item").fill("Confirm midfield rotation");
  await page.getByRole("button", { name: "Add to watchlist" }).click();
  await page
    .getByLabel("Your post-game note")
    .fill("Barcelona controlled the central spaces in the demo recap.");
  await page.getByRole("button", { name: "Save recap" }).click();
  await page.getByRole("button", { name: "View demo brief" }).click();
  await expect(page.getByText("Data used")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Your post-game note")).toHaveValue(
    "Barcelona controlled the central spaces in the demo recap.",
  );

  await page.getByRole("link", { name: "Watchlist" }).click();
  await expect(
    page.getByText("Confirm midfield rotation", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Complete Confirm midfield rotation" })
    .click();

  await page.getByRole("link", { name: "Activity" }).click();
  await expect(
    page.locator(".metric-card").filter({ hasText: "Briefs viewed" }),
  ).toContainText("1");
  await expect(
    page.locator(".metric-card").filter({ hasText: "Watchlist" }),
  ).toContainText("1");
  await expect(
    page.locator(".metric-card").filter({ hasText: "Completed" }),
  ).toContainText("1");
  await expect(
    page.locator(".metric-card").filter({ hasText: "Recaps" }),
  ).toContainText("1");
  await expect(
    page.getByText("Completed “Confirm midfield rotation”"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Reset demo" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(
    dialog.getByRole("heading", { name: "Reset this demo?" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Reset demo" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Real Madrid" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("portfolio:e2e-sentinel")),
    )
    .toBe("keep");
  expect(browserErrors).toEqual([]);
});

test("keyboard, reduced motion, 404, and responsive layouts remain usable", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to main content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();

  await page.emulateMedia({ reducedMotion: "reduce" });
  const duration = await page
    .locator(".game-row")
    .first()
    .evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(["0s", "0.00001s", "1e-05s"]).toContain(duration);

  for (const viewport of [
    { width: 360, height: 800 },
    { width: 768, height: 900 },
    { width: 1280, height: 900 },
    { width: 1536, height: 960 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(
      overflow,
      `horizontal overflow at ${viewport.width}px`,
    ).toBeLessThanOrEqual(0);
  }

  await page.goto("/games/not-a-demo-game");
  await expect(
    page.getByRole("heading", { name: "Game not found" }),
  ).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("Yankees detail, watchlist, Activity, sport switching, and archived routes remain deterministic", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/");
  await page.getByLabel("Selected team").selectOption("new-york-yankees");
  await expect(
    page.getByRole("heading", { level: 1, name: "New York Yankees" }),
  ).toBeVisible();
  await page.locator(".game-row").first().click();
  await expect(page).toHaveURL(/\/games\/mlb-(?:nyy-01|\d+-new-york-yankees)$/);

  await page.reload();
  await expect(
    page.locator(".matchup-team-name").filter({ hasText: "New York Yankees" }),
  ).toBeVisible();
  await page.getByLabel("Preparation item").fill("Confirm Yankees starter");
  await page.getByRole("button", { name: "Add to watchlist" }).click();

  await page.getByRole("link", { name: "Watchlist" }).click();
  await expect(
    page.getByText("Confirm Yankees starter", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Open (matchup|archived demo)/ }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Activity" }).click();
  await expect(
    page.getByText("Added “Confirm Yankees starter” to the watchlist"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /View (game|archived demo)/ }),
  ).toBeVisible();

  await page.goto("/games/mlb-nyy-01");
  await expect(
    page.getByText("Archived demo item", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Archived demo item", { exact: true }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Dashboard" }).click();
  await page
    .getByLabel("Select sport")
    .getByRole("button", { name: "Soccer" })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Real Madrid" }),
  ).toBeVisible();
  await page
    .getByLabel("Select sport")
    .getByRole("button", { name: "Baseball" })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "New York Yankees" }),
  ).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("switching team or sport from a game page opens that team's games", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/");
  await page.locator(".game-row").first().click();
  await expect(page).toHaveURL(/\/games\//);

  await page.getByLabel("Selected team").selectOption("barcelona");
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "FC Barcelona" }),
  ).toBeVisible();

  await page.locator(".game-row").first().click();
  await expect(page).toHaveURL(/\/games\//);
  await page
    .getByLabel("Select sport")
    .getByRole("button", { name: "Baseball" })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "New York Yankees" }),
  ).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("canonical team APIs validate input and expose freshness metadata", async ({
  request,
}) => {
  const teams = await request.get("/api/teams");
  expect(teams.ok()).toBe(true);
  expect((await teams.json()).data).toHaveLength(4);

  const schedule = await request.get("/api/teams/real-madrid/games?limit=2");
  expect(schedule.ok()).toBe(true);
  const body = await schedule.json();
  expect(body.data.games).toHaveLength(2);
  expect(["live", "stale", "demo"]).toContain(body.data.freshness.mode);
  if (body.data.freshness.mode !== "demo") {
    expect(body.data.freshness.provider).toBe("football-data");
    expect(body.data.freshness.attribution.name).toBe("football-data.org");
  }

  const invalid = await request.get("/api/teams/real-madrid/games?limit=11");
  expect(invalid.status()).toBe(400);

  const legacy = await request.get("/api/games/soc-rma-01");
  expect(legacy.ok()).toBe(true);
  expect((await legacy.json()).data.game.id).toBe("soc-rma-01");

  const baseball = await request.get(
    "/api/teams/new-york-yankees/games?limit=5",
  );
  expect(baseball.ok()).toBe(true);
  const baseballBody = await baseball.json();
  expect(baseballBody.data.games).toHaveLength(5);
  expect(baseballBody.data.context.kind).toBe("baseball");

  const archivedBaseball = await request.get("/api/games/mlb-nyy-01");
  expect(archivedBaseball.ok()).toBe(true);
  expect((await archivedBaseball.json()).data.game.id).toBe("mlb-nyy-01");

  const health = await request.get("/api/health");
  const healthBody = await health.json();
  expect([200, 503]).toContain(health.status());
  if (healthBody.data.checks.database.configured) {
    expect(["healthy", "degraded"]).toContain(healthBody.data.status);
  } else {
    expect(healthBody.data.status).toBe("unavailable");
  }
  expect(JSON.stringify(healthBody)).not.toContain("postgresql://");
  expect(healthBody.data.checks).toEqual(
    expect.objectContaining({
      footballData: expect.any(Object),
      mlbStats: expect.any(Object),
      baseballSavant: expect.any(Object),
    }),
  );
});
