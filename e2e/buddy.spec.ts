import { expect, test } from "@playwright/test";

test("the buddy launcher opens, answers, and never breaks the page", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/");
  await page.getByRole("button", { name: "Buddy" }).click();
  await expect(page.locator(".buddy-panel")).toBeVisible();

  await page.getByLabel("Ask the buddy").fill("what do you make of this?");
  await page.getByRole("button", { name: "Ask" }).click();

  // Playwright's webServer runs with DATABASE_URL= and OPENAI_API_KEY= (see
  // playwright.config.ts), so this is the deterministic `none`-context
  // fallback reply, not a live model call.
  await expect(page.locator(".buddy-transcript")).toContainText(
    "AI isn't configured on this deployment, so I can't put together a take here. Check the board for the schedule instead.",
  );

  expect(browserErrors).toEqual([]);
});
