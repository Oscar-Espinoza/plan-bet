import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const ROUTES = [
  "/",
  "/games/soc-rma-01",
  "/games/mlb-nyy-01",
  "/watchlist",
  "/activity",
  "/system",
  "/games/not-a-demo-game",
  "/sign-in",
  "/rules",
  "/bets",
];

const SEVERE_IMPACTS = new Set(["serious", "critical"]);

for (const route of ROUTES) {
  test(`${route} has no serious or critical accessibility violations`, async ({
    page,
  }) => {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).analyze();
    const severe = results.violations.filter(
      (violation) => violation.impact && SEVERE_IMPACTS.has(violation.impact),
    );

    const details = severe
      .map((violation) => {
        const targets = violation.nodes
          .map((node) => node.target.join(" "))
          .join("; ");
        return `[${violation.impact}] ${violation.id}: ${violation.help} — targets: ${targets}`;
      })
      .join("\n");

    expect(severe, `Accessibility violations on ${route}:\n${details}`).toEqual(
      [],
    );
  });
}
