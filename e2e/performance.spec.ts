import { expect, test } from "@playwright/test";

test("sport filters and browser history update without fetching the board again", async ({
  page,
}) => {
  await page.goto("/?sport=soccer");
  await expect(
    page.getByRole("link", { name: "Soccer", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const boardRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/" && url.searchParams.has("_rsc"))
      boardRequests.push(request.url());
  });
  await page.getByRole("link", { name: "All", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "All", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Baseball", exact: true }).click();
  await expect(page.locator(".game-row")).toHaveCount(2);
  await page.goBack();
  await expect(
    page.getByRole("link", { name: "All", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".game-row")).toHaveCount(4);
  expect(boardRequests).toEqual([]);
});

test("a prefetched match opens with working tabs and back navigation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const match = page.getByRole("link", { name: "View Match & Place Bet" });
  await match.hover();
  await page.waitForTimeout(500);
  await match.click();
  await expect(
    page.getByRole("tab", { name: "Overview", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Stats", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Stats", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("link", { name: "Back to games", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Upcoming games", exact: true }),
  ).toBeAttached();
  expect(errors).toEqual([]);
});
