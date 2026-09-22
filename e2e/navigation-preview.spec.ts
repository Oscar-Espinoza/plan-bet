import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

async function holdDestination(page: Page, pathname: string) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    (url) => url.pathname === pathname && url.searchParams.has("_rsc"),
    async (route) => {
      await gate;
      await route.continue();
    },
  );
  return release;
}

const barcelona = (page: Page) =>
  page.locator(".game-row", { hasText: "FC Barcelona" }).first();
const preview = (page: Page) => page.locator("[data-navigation-preview]");

test("cold mobile tap paints the selected match before its response arrives", async ({
  page,
}) => {
  const release = await holdDestination(page, "/games/soc-fcb-01");
  try {
    await page.goto("/");
    await barcelona(page).scrollIntoViewIfNeeded();
    const opponent = (
      await barcelona(page).locator(".game-team").last().innerText()
    ).trim();
    await page.evaluate(() => {
      document.addEventListener(
        "click",
        () => {
          const start = performance.now();
          const observer = new MutationObserver(() => {
            if (
              !document.querySelector("[data-navigation-preview] .mp-side-name")
            )
              return;
            observer.disconnect();
            requestAnimationFrame(() => {
              document.documentElement.dataset.previewMs = String(
                performance.now() - start,
              );
            });
          });
          observer.observe(document.body, { childList: true, subtree: true });
        },
        { capture: true, once: true },
      );
    });
    await barcelona(page).tap();
    await expect(preview(page).locator(".mp-side-name").first()).toHaveText(
      "FC Barcelona",
    );
    await expect(preview(page).locator(".mp-side-name").last()).toHaveText(
      opponent,
    );
    await expect(page.locator(".route-content")).toBeHidden();
    await expect(preview(page).getByRole("button")).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute("data-preview-ms", /\d/);
    const elapsed = Number(
      await page.locator("html").getAttribute("data-preview-ms"),
    );
    expect(elapsed).toBeLessThan(100);
    console.log(`Cold mobile tap to preview: ${elapsed.toFixed(1)} ms`);
    await page.waitForTimeout(1000);
    await expect(preview(page)).toBeVisible();
  } finally {
    release();
  }
  await expect(page).toHaveURL(/\/games\/soc-fcb-01$/);
  await expect(page.locator(".mp-block").first()).toBeVisible();
  await expect(preview(page)).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".mp-block").first()).toBeVisible();
  await expect(preview(page)).toHaveCount(0);
});

test("navigation can be cancelled back to the board while a match is pending", async ({
  page,
}) => {
  const release = await holdDestination(page, "/games/soc-fcb-01");
  try {
    await page.goto("/");
    await barcelona(page).tap();
    await expect(preview(page)).toBeVisible();
    await page.getByRole("link", { name: "Back to games", exact: true }).tap();
    await expect(barcelona(page)).toBeVisible();
    await expect(preview(page)).toHaveCount(0);
  } finally {
    release();
  }
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/\/$/);
  await expect(barcelona(page)).toBeVisible();
});

test("latest destination wins and reduced motion removes the transition", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const releaseGame = await holdDestination(page, "/games/soc-fcb-01");
  const releaseGroups = await holdDestination(page, "/groups");
  try {
    await page.goto("/");
    await barcelona(page).tap();
    await expect(preview(page)).toBeVisible();
    await page
      .getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("link", { name: "Groups" })
      .tap();
    await expect(preview(page)).toHaveAttribute(
      "data-navigation-preview",
      "/groups",
    );
    await expect(
      preview(page).getByRole("heading", { name: "Groups" }),
    ).toBeVisible();
    expect(
      await preview(page).evaluate(
        (el) => getComputedStyle(el).animationDuration,
      ),
    ).toBe("0s");
    releaseGroups();
    await expect(page).toHaveURL(/\/groups$/);
    await expect(preview(page)).toHaveCount(0);
  } finally {
    releaseGroups();
    releaseGame();
  }
  await expect(preview(page)).toHaveCount(0);
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/\/groups$/);
});

test("browser back clears a pending preview", async ({ page }) => {
  await page.goto("/rules");
  await page.getByRole("link", { name: "Matchday Plan home" }).tap();
  await expect(barcelona(page)).toBeVisible();
  const release = await holdDestination(page, "/games/soc-fcb-01");
  // A fresh document drops Next's prefetched game entry.
  await page.reload();
  try {
    await barcelona(page).tap();
    await expect(preview(page)).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/rules$/);
    await expect(preview(page)).toHaveCount(0);
  } finally {
    release();
  }
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/\/rules$/);
});

test("local filters and keyboard navigation keep their normal behavior", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Soccer", exact: true }).tap();
  await expect(page).toHaveURL(/sport=soccer/);
  await expect(preview(page)).toHaveCount(0);
  const release = await holdDestination(page, "/you");
  try {
    const bets = page
      .getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("link", { name: "My Bets" });
    await bets.focus();
    await page.keyboard.press("Enter");
    await expect(
      preview(page).getByRole("heading", { name: "My Bets" }),
    ).toBeVisible();
  } finally {
    release();
  }
  await expect(page).toHaveURL(/\/you\?section=bets#you-history-heading$/);
  await expect(preview(page)).toHaveCount(0);
});

test("failed client fetch recovers through Next navigation without a stuck preview", async ({
  page,
}) => {
  await page.route(
    (url) =>
      url.pathname === "/games/soc-fcb-01" && url.searchParams.has("_rsc"),
    (route) => route.abort(),
  );
  await page.goto("/");
  await barcelona(page).tap();
  await expect(page).toHaveURL(/\/games\/soc-fcb-01$/);
  await expect(page.locator(".mp-block").first()).toBeVisible();
  await expect(preview(page)).toHaveCount(0);
});

for (const scenario of [
  { width: 390, locale: "es", game: "soc-rma-01" },
  { width: 320, locale: "en", game: "soc-fcb-01" },
  { width: 1280, locale: "es", game: "mlb-nyy-01" },
]) {
  test(`match chrome stays in place at ${scenario.width}px in ${scenario.locale}`, async ({
    page,
    context,
    baseURL,
  }) => {
    await page.setViewportSize({ width: scenario.width, height: 844 });
    await context.addCookies([
      { name: "locale", value: scenario.locale, url: baseURL! },
    ]);
    const release = await holdDestination(page, `/games/${scenario.game}`);
    const selectors = [
      ".mp-breadcrumb",
      ".mp-bug",
      ".mp-sides",
      ".mp-clock",
      ".mp-when",
      ".mp-tabs",
      ".mp-tab-panel",
    ];
    const measure = (root: string) =>
      page.locator(root).evaluate(
        (element, selectors) =>
          selectors.map((selector) => {
            const { x, y, width, height } = element
              .querySelector(selector)!
              .getBoundingClientRect();
            return { selector, x, y, width, height };
          }),
        selectors,
      );
    let before: Awaited<ReturnType<typeof measure>>;
    try {
      await page.goto("/");
      const link = page.locator(`.game-row[href="/games/${scenario.game}"]`);
      const kickoff = await link.locator("time").getAttribute("datetime");
      await link.tap();
      await expect(preview(page).locator(".mp-clock time")).not.toBeEmpty();
      await expect(preview(page).locator(".mp-when time")).toHaveAttribute(
        "datetime",
        kickoff!,
      );
      await expect(preview(page).locator(".mp-when time")).not.toBeEmpty();
      await expect(
        preview(page).locator(".wager-panel .selection-row").first(),
      ).toBeVisible();
      await expect(preview(page).locator("button:enabled")).toHaveCount(0);
      before = await measure("[data-navigation-preview]");
    } finally {
      release();
    }
    await expect(page.locator(".route-content .mp-clock time")).not.toBeEmpty();
    await expect(preview(page)).toHaveCount(0);
    const after = await measure(".route-content");
    for (let i = 0; i < before!.length; i++) {
      for (const axis of ["x", "y", "width"] as const) {
        expect(
          Math.abs(after[i][axis] - before![i][axis]),
          `${selectors[i]} ${axis}`,
        ).toBeLessThanOrEqual(1);
      }
      // The panel grows with real data; the header and tabs must not move.
      if (selectors[i] !== ".mp-tab-panel")
        expect(
          Math.abs(after[i].height - before![i].height),
          `${selectors[i]} height`,
        ).toBeLessThanOrEqual(1);
    }
  });
}
