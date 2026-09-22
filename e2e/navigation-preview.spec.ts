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
