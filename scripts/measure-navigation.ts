import { chromium, type Page } from "@playwright/test";

// Run against `pnpm build && pnpm start` in keyless demo mode. Pass two URLs
// to compare isolated before/after builds with the same browser and machine.
async function clickToPaint(page: Page, click: string, ready: string) {
  return page.evaluate(
    ({ click, ready }) =>
      new Promise<number>((resolve, reject) => {
        const start = performance.now();
        const timer = setTimeout(() => {
          observer.disconnect();
          reject(new Error(`Timed out waiting for ${ready}`));
        }, 10_000);
        const observer = new MutationObserver(() => {
          if (!document.querySelector(ready)) return;
          observer.disconnect();
          clearTimeout(timer);
          requestAnimationFrame(() => resolve(performance.now() - start));
        });
        observer.observe(document.body, {
          subtree: true,
          childList: true,
          attributes: true,
        });
        document.querySelector<HTMLElement>(click)!.click();
      }),
    { click, ready },
  );
}

const browser = await chromium.launch();
try {
  for (const baseUrl of process.argv.slice(2)) {
    const samples = [];
    for (let i = 0; i < 5; i++) {
      const page = await browser.newPage();
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      const coldDocumentMs = await page.evaluate(
        () =>
          (
            performance.getEntriesByType(
              "navigation",
            )[0] as PerformanceNavigationTiming
          ).domContentLoadedEventEnd,
      );
      await page.waitForTimeout(1000);
      let boardRequests = 0;
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (url.pathname === "/" && url.searchParams.has("_rsc"))
          boardRequests++;
      });
      const filterMs = await clickToPaint(
        page,
        '.slate-chip[href="/?sport=soccer"]',
        '.slate-chip[href="/?sport=soccer"][aria-current="page"]',
      );
      await page.waitForTimeout(1000);
      const filterRequests = boardRequests;
      const matchMs = await clickToPaint(
        page,
        ".next-up-cta",
        '[role="tablist"]',
      );
      const backMs = await clickToPaint(page, ".shell-back", ".board");
      samples.push({
        coldDocumentMs,
        filterMs,
        filterRequests,
        matchMs,
        backMs,
      });
      await page.close();
    }
    process.stdout.write(JSON.stringify({ baseUrl, samples }) + "\n");
  }
} finally {
  await browser.close();
}
