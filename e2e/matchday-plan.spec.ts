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

  await page
    .getByRole("link", { name: /Open Barcelona versus Real Betis/i })
    .click();
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
