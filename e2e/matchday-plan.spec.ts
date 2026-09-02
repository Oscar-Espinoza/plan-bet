import { expect, test } from "@playwright/test";

test("Barcelona matchup renders its evidence and survives a reload", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem("portfolio:e2e-sentinel", "keep"),
  );
  // The slate lists every tracked team's games together — find Barcelona's
  // row by matchup text rather than a per-team page.
  await expect(
    page.locator(".game-row", { hasText: "FC Barcelona" }).first(),
  ).toBeVisible();
  await page.locator(".game-row", { hasText: "FC Barcelona" }).first().click();
  await expect(
    page.locator(".mp-side-name").filter({ hasText: "FC Barcelona" }),
  ).toBeVisible();

  // The matchup's context is rendered from the server on every load — no
  // browser-local state decides whether it is there.
  await expect(page.locator(".mp-block").first()).toBeVisible();

  await page.reload();
  await expect(page.locator(".mp-block").first()).toBeVisible();
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
  // The stylesheet declares no `transition` anywhere, so a transitionDuration
  // assertion tests nothing. .loading-panel carries the app's one real
  // @keyframes animation, but it is only mounted for the instant Next.js
  // shows a route's loading.tsx — too transient to depend on in a fast demo
  // server. Injecting a probe element with the same class exercises the real
  // stylesheet rule (including the reduced-motion override) deterministically.
  const animationDuration = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.className = "panel loading-panel";
    document.body.appendChild(probe);
    const value = getComputedStyle(probe).animationDuration;
    probe.remove();
    return value;
  });
  expect(animationDuration).toBe("0s");

  for (const route of [
    "/",
    "/games/soc-rma-01",
    "/games/mlb-nyy-01",
    "/you",
    "/rules",
  ]) {
    for (const viewport of [
      { width: 360, height: 800 },
      { width: 768, height: 900 },
      { width: 1280, height: 900 },
      { width: 1536, height: 960 },
      // 200%-zoom equivalents of 1280x1080 and 720x800 viewports.
      { width: 640, height: 540 },
      { width: 360, height: 400 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(route);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(
        overflow,
        `horizontal overflow at ${viewport.width}x${viewport.height} on ${route}`,
      ).toBeLessThanOrEqual(0);
    }
  }

  await page.goto("/games/not-a-demo-game");
  await expect(
    page.getByRole("heading", { name: "Game not found" }),
  ).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("mobile shell scrolls content between the header and navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });

  for (const route of ["/", "/you", "/groups"]) {
    await page.goto(route);
    const nav = page.getByRole("navigation", { name: "Mobile navigation" });
    const scroller = page.locator(".workspace-scroll");
    await expect(nav).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = "auto";
      const spacer = document.createElement("div");
      spacer.style.height = "1500px";
      document.querySelector("main")?.appendChild(spacer);
    });

    for (const scrollTop of [0, 250, Number.MAX_SAFE_INTEGER]) {
      await scroller.evaluate(
        (element, top) => element.scrollTo(0, top),
        scrollTop,
      );
      const dimensions = await nav.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const headerRect = document
          .querySelector(".topbar")!
          .getBoundingClientRect();
        const scroller = document.querySelector(".workspace-scroll")!;
        const scrollerRect = scroller.getBoundingClientRect();
        const linkWidths = Array.from(
          element.querySelectorAll("a"),
          (link) => link.getBoundingClientRect().width,
        );
        return {
          bottom: rect.bottom,
          left: rect.left,
          position: getComputedStyle(element).position,
          top: rect.top,
          width: rect.width,
          clientHeight: document.documentElement.clientHeight,
          clientWidth: document.documentElement.clientWidth,
          headerBottom: headerRect.bottom,
          linkWidths,
          scrollerBottom: scrollerRect.bottom,
          scrollerScrollTop: scroller.scrollTop,
          scrollerTop: scrollerRect.top,
        };
      });

      if (scrollTop === 0) expect(dimensions.scrollerScrollTop).toBe(0);
      else expect(dimensions.scrollerScrollTop).toBeGreaterThan(0);
      expect(dimensions.bottom).toBeCloseTo(dimensions.clientHeight, 0);
      expect(dimensions.position).toBe("static");
      expect(dimensions.left).toBe(0);
      expect(dimensions.width).toBe(dimensions.clientWidth);
      expect(dimensions.scrollerTop).toBeCloseTo(dimensions.headerBottom, 0);
      expect(dimensions.scrollerBottom).toBeCloseTo(dimensions.top, 0);
      expect(dimensions.linkWidths).toHaveLength(3);
      expect(
        Math.max(...dimensions.linkWidths) - Math.min(...dimensions.linkWidths),
      ).toBeLessThanOrEqual(1);
    }
  }
});

test("Yankees detail and archived routes remain deterministic", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/");
  await page
    .locator(".game-row", { hasText: "New York Yankees" })
    .first()
    .click();
  await expect(page).toHaveURL(/\/games\/mlb-(?:nyy-01|\d+-new-york-yankees)$/);

  await page.reload();
  await expect(
    page.locator(".mp-side-name").filter({ hasText: "New York Yankees" }),
  ).toBeVisible();
  await expect(page.locator(".mp-block").first()).toBeVisible();

  // The legacy route still resolves; its provenance label is gone with the
  // rest of the audit trail, so the matchup itself is what proves it loaded.
  await page.goto("/games/mlb-nyy-01");
  await expect(page.locator(".mp-side-name").first()).toBeVisible();
  await page.reload();
  await expect(page.locator(".mp-side-name").first()).toBeVisible();

  await page.getByRole("link", { name: "Games", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(browserErrors).toEqual([]);
});

test("the slate's sport chips scope the board, and the game page returns to it", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));

  const filters = () =>
    page.getByRole("navigation", { name: "Filter by sport" });

  await page.goto("/");
  await filters().getByRole("link", { name: "Soccer" }).click();
  await expect(page).toHaveURL(/\?sport=soccer$/);
  await expect(
    page.locator(".game-row", { hasText: "FC Barcelona" }).first(),
  ).toBeVisible();
  await expect(
    page.locator(".game-row", { hasText: "New York Yankees" }),
  ).toHaveCount(0);

  await filters().getByRole("link", { name: "Baseball" }).click();
  await expect(page).toHaveURL(/\?sport=baseball$/);
  await expect(
    page.locator(".game-row", { hasText: "New York Yankees" }).first(),
  ).toBeVisible();
  await expect(
    page.locator(".game-row", { hasText: "FC Barcelona" }),
  ).toHaveCount(0);

  await page.locator(".game-row").first().click();
  await expect(page).toHaveURL(/\/games\//);
  await page.getByRole("link", { name: "Back to games" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(browserErrors).toEqual([]);
});

test("the health endpoint reports every provider without leaking config", async ({
  request,
}) => {
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

test.describe("kickoff times", () => {
  test.use({ timezoneId: "America/Argentina/Buenos_Aires" });

  test("clocks read in the viewer's own zone, never the server's", async ({
    page,
  }) => {
    await page.goto("/?sport=soccer");
    const times = page.locator(".game-time time");
    const count = await times.count();
    expect(count).toBeGreaterThan(0);

    for (let index = 0; index < count; index += 1) {
      const time = times.nth(index);
      const iso = await time.getAttribute("datetime");
      expect(iso).toBeTruthy();
      const expected = new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/Argentina/Buenos_Aires",
      }).format(new Date(iso as string));
      // Fails loudly if the server's zone is ever frozen into the DOM again.
      await expect(time).toHaveText(expected);
    }

    await expect(page.locator(".slate-tz")).toContainText("GMT-3");
    await expect(page.locator(".slate-tz")).not.toContainText("UTC");
    await expect(page.locator(".slate-tz")).toContainText("your time");
  });
});
