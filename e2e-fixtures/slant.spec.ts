import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { placement } from "../browser-fixtures/data";

const action = (page: Page) => page.locator(".ribbon-action button");
const home = (page: Page) => page.getByRole("button", { name: /Home\s*2.40/ });
async function open(page: Page, query = "") {
  await page.goto(`/games/soc-rma-01${query}`);
  const skip = page.getByRole("button", { name: "Skip the tour" });
  if (await skip.isVisible()) await skip.click();
  await expect(action(page)).toHaveCount(1);
}
async function axe(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
  ).toEqual([]);
}

test("native form: unselected, stake increments, group, pending and success", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await expect(action(page)).toHaveText("Choose a selection");
  await expect(action(page)).toBeDisabled();
  await expect(page.locator(".ribbon-returns")).toContainText("—");
  await home(page).click();
  await expect(action(page)).toHaveText("Place 1 credits");
  await page.getByRole("button", { name: "+5", exact: true }).click();
  await expect(page.getByLabel("Stake")).toHaveValue("6");
  await page.getByRole("button", { name: "+25", exact: true }).click();
  await expect(page.getByLabel("Stake")).toHaveValue("31");
  await page.getByRole("button", { name: "max", exact: true }).click();
  await expect(page.getByLabel("Stake")).toHaveValue("500");
  await page.getByLabel("Stake").fill("25");
  await page.getByLabel("Place", { exact: true }).selectOption("group-1");
  await expect(page.locator(".ribbon-returns")).toContainText("60");
  expect(
    await action(page).evaluate((button: HTMLButtonElement) => button.form?.id),
  ).toBe(await page.locator("form.side-form").getAttribute("id"));
  await axe(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requestBody: unknown;
  await page.route("**/api/bets", async (route) => {
    requestBody = route.request().postDataJSON();
    await gate;
    await route.fulfill({ json: { data: placement } });
  });
  // The portaled button is associated with the form: Enter uses the same handler.
  await page.getByLabel("Stake").press("Enter");
  await expect(action(page)).toHaveText("Placing…");
  await expect(action(page)).toBeDisabled();
  expect(requestBody).toMatchObject({
    stake: 25,
    groupId: "group-1",
    selectionId: "home",
    price: 2.4,
  });
  release();
  await expect(page.locator(".ribbon-feedback [role=status]")).toContainText(
    "Placed 25 on Home",
  );
  await expect(action(page)).toHaveText("Choose a selection");
  await expect(page.getByLabel("Stake")).toHaveCount(0);
  await axe(page);
});

test("native invalid input, insufficient credits, server and network errors", async ({
  page,
}) => {
  await open(page, "?balance=20");
  await home(page).click();
  let requests = 0;
  await page.route("**/api/bets", (route) => {
    requests++;
    return route.fulfill({
      status: 409,
      json: { error: { message: "This game has already started." } },
    });
  });
  await page.getByLabel("Stake").fill("1.5");
  await action(page).click();
  expect(
    await page
      .getByLabel("Stake")
      .evaluate((input: HTMLInputElement) => input.validity.stepMismatch),
  ).toBe(true);
  expect(requests).toBe(0);
  await page.getByLabel("Stake").fill("21");
  await expect(action(page)).toBeDisabled();
  await expect(page.locator(".ribbon-feedback")).toContainText(
    "Stake exceeds your balance of 20",
  );
  await page.getByLabel("Stake").fill("10");
  await action(page).click();
  await expect(page.locator(".ribbon-feedback [role=alert]")).toContainText(
    "already started",
  );
  await expect(action(page)).toBeEnabled();
  await axe(page);
  await page.unroute("**/api/bets");
  await page.route("**/api/bets", (route) => route.abort());
  await action(page).click();
  await expect(page.locator(".ribbon-feedback [role=alert]")).toContainText(
    "did not go through",
  );
});

test("exact score and deep link use house prices", async ({ page }) => {
  await open(page, "?pick=soccer-exact-score:2-1");
  await expect(page.getByLabel("Real Madrid goals")).toHaveValue("2");
  await expect(page.getByLabel("Villarreal goals")).toHaveValue("1");
  await expect(page.locator(".ribbon-returns")).toContainText("9");
  await page.getByLabel("Real Madrid goals").fill("4");
  await expect(
    page.getByText("Not priced — 0-0 through 3-3 only"),
  ).toBeVisible();
  await expect(action(page)).toBeDisabled();
  await page.getByLabel("Real Madrid goals").fill("3");
  await expect(action(page)).toBeEnabled();
});

for (const [state, copy] of [
  ["unavailable", "This game is not open for bets."],
  ["finished", "This game has finished."],
  ["live", "already in progress"],
  ["postponed", "has been postponed"],
  ["cancelled", "has been cancelled"],
  ["signed-out", "Signing in only unlocks"],
])
  test(`preserves ${state} explanation`, async ({ page }) => {
    await page.goto(`/games/soc-rma-01?state=${state}`);
    await expect(page.getByText(copy, { exact: false })).toBeVisible();
    await expect(page.locator(".selection-button")).toHaveCount(0);
    if (state === "signed-out")
      await expect(page.locator(".ribbon-action a")).toHaveAttribute(
        "href",
        "/sign-in?callbackUrl=/games/soc-rma-01",
      );
    else await expect(action(page)).toHaveCount(0);
    await axe(page);
  });

test("route cleanup and sport changes leave only the current ribbon content", async ({
  page,
}) => {
  await page.goto("/");
  const clock = page.locator(".ribbon-clock time");
  await expect(clock).toHaveCount(1);
  await page.getByRole("link", { name: "Soccer", exact: true }).click();
  expect(await clock.getAttribute("datetime")).toBe(
    await page.locator(".next-up-meta time").getAttribute("datetime"),
  );
  await page.getByRole("link", { name: "Open matchup" }).click();
  await expect(clock).toHaveCount(0);
  await home(page).click();
  await page.getByRole("link", { name: "Back to games" }).click();
  await expect(action(page)).toHaveCount(0);
  await expect(page.locator(".ribbon-returns")).toBeEmpty();
  await expect(page.locator(".ribbon-feedback")).toBeEmpty();
  await expect(clock).toHaveCount(1);
  await page.goto("/?empty=1");
  await expect(clock).toHaveCount(0);
});

test("hydration and delayed targets never duplicate the action", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page, "?hydrate=1");
  await expect(
    page.getByRole("button", { name: "Choose a selection" }),
  ).toHaveCount(1);
  await page.goto("/delayed");
  await expect(
    page.locator(".panel button", { hasText: "Choose a selection" }),
  ).toHaveCount(1);
  await expect(page.locator(".ribbon-action button")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Choose a selection" }),
  ).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("all plate borders, keyboard focus, press transform and reduced motion", async ({
  page,
}) => {
  await open(page);
  await page.keyboard.press("Tab");
  await home(page).focus();
  await expect(home(page)).toBeFocused();
  expect(
    await home(page).evaluate(
      (element) => getComputedStyle(element).outlineWidth,
    ),
  ).toBe("2px");
  for (const tile of await page.locator(".selection-button").all()) {
    const borders = await tile.evaluate((element) => {
      const css = getComputedStyle(element);
      return [
        css.borderTopWidth,
        css.borderRightWidth,
        css.borderBottomWidth,
        css.borderLeftWidth,
        css.clipPath,
      ];
    });
    expect(borders).toEqual(["1px", "1px", "1px", "1px", "none"]);
  }
  await home(page).evaluate((element) =>
    element.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  const box = await home(page).boundingBox();
  const before = await home(page).evaluate(
    (element) => getComputedStyle(element).transform,
  );
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  const during = await home(page).evaluate(
    (element) => getComputedStyle(element).transform,
  );
  expect(during).toBe(before.replace(", 0, 0)", ", 0, 1)"));
  await page.mouse.up();
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator("form.side-form")
      .evaluate((element) => getComputedStyle(element).transform),
  ).toBe("none");
  await axe(page);
});

for (const size of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 360, height: 400 },
  { width: 768, height: 900 },
  { width: 1280, height: 900 },
]) {
  test(`shell clears ribbon, tour and buddy at ${size.width}×${size.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await page.goto("/games/soc-rma-01?long=1");
    await expect(page.locator(".tour-bar")).toBeVisible();
    await expect(page.locator(".buddy-launcher")).toBeVisible();
    await expect
      .poll(() =>
        page.locator(".ribbon").evaluate((element) => {
          const shell = element.closest(".app-shell")!;
          return Math.abs(
            parseFloat(getComputedStyle(shell).getPropertyValue("--ribbon-h")) -
              element.getBoundingClientRect().height,
          );
        }),
      )
      .toBeLessThan(1);
    const geometry = await page.evaluate(() => {
      const box = (selector: string) =>
        document.querySelector(selector)!.getBoundingClientRect();
      return {
        ribbon: box(".ribbon").top,
        tourBottom: box(".tour-bar").bottom,
        tourTop: box(".tour-bar").top,
        buddyBottom: box(".buddy-launcher").bottom,
        scrollerBottom: box(".workspace-scroll").bottom,
        navTop: box(".mobile-nav").top,
        ribbonBottom: box(".ribbon").bottom,
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    });
    expect(geometry.tourBottom).toBeCloseTo(geometry.ribbon, 0);
    expect(geometry.buddyBottom).toBeLessThanOrEqual(geometry.tourTop);
    expect(geometry.overflow).toBe(0);
    if (size.width < 1024) {
      expect(geometry.scrollerBottom).toBeCloseTo(geometry.ribbon, 0);
      expect(geometry.ribbonBottom).toBeCloseTo(geometry.navTop, 0);
    }
  });
}

test("won, lost and void history and the board pass axe", async ({ page }) => {
  await page.goto("/you");
  await expect(
    page.getByRole("cell", { name: "Positive: won", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Negative: lost", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Warning: voided", exact: true }),
  ).toBeVisible();
  await axe(page);
  await page.goto("/");
  await axe(page);
});

test("a request completing after navigation cannot repopulate the ribbon", async ({
  page,
}) => {
  await open(page);
  await home(page).click();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/bets", async (route) => {
    await gate;
    await route.fulfill({ json: { data: placement } });
  });
  await action(page).click();
  await expect(action(page)).toHaveText("Placing…");
  await page.getByRole("link", { name: "Back to games" }).click();
  release();
  await expect(page.locator(".ribbon-clock time")).toHaveCount(1);
  await expect(action(page)).toHaveCount(0);
  await expect(page.locator(".ribbon-feedback")).toBeEmpty();
  await page.getByRole("link", { name: "Open matchup" }).click();
  await expect(action(page)).toHaveText("Choose a selection");
  await expect(page.locator(".ribbon-feedback")).toBeEmpty();
});

test("team crests load, follow route changes, and fail without hiding names", async ({
  page,
}) => {
  // Keep external availability out of the interaction suite; bundled originals
  // still load from the real public directory.
  await page.route(
    /^https:\/\/(?:crests\.football-data\.org|www\.mlbstatic\.com)\//,
    (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="gold"/></svg>',
      }),
  );
  for (const [route, slug] of [
    ["soc-rma-01", "real-madrid"],
    ["soc-fcb-01", "barcelona"],
    ["mlb-nyy-01", "new-york-yankees"],
    ["mlb-bos-01", "boston-red-sox"],
  ]) {
    await page.goto(`/games/${route}`);
    const logo = page.locator(`.mp-bug img[src="/team-logos/${slug}.svg"]`);
    await expect(logo).toHaveCount(1);
    await expect(logo).toHaveJSProperty("complete", true);
    expect(
      await logo.evaluate((img: HTMLImageElement) => img.naturalWidth),
    ).toBeGreaterThan(0);
  }
  await page.setViewportSize({ width: 320, height: 568 });
  await open(page);
  await expect(page.locator(".mp-bug .team-logo")).toHaveCount(2);
  await expect(page.locator(".mp-side-name").last()).toHaveText("Villarreal");
  await axe(page);
  await page.route("https://crests.football-data.org/**", (route) =>
    route.abort(),
  );
  await page.reload();
  await expect(page.locator(".mp-bug .team-logo")).toHaveCount(1);
  await expect(page.locator(".mp-side-name").last()).toHaveText("Villarreal");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  );
  await page.getByRole("link", { name: "Back to games" }).click();
  await expect(page.locator(".next-up-team .team-logo").first()).toBeVisible();
  await expect(page.locator(".game-team .team-logo").first()).toBeVisible();
});
