import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GroupActivity, GroupStandings } from "./group-activity";
import { LanguageProvider } from "./language-provider";
import { history, wager } from "../../browser-fixtures/data";
import { getSnapshot } from "@/lib/seed";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(cleanup);
it("shows structured teams and three bets, expands without losing selections, and links to discussion", () => {
  render(
    <GroupActivity
      viewerId="a"
      members={[{ userId: "a", name: "Oscar" }]}
      matches={[
        {
          canonicalGameId: "one",
          latestActivity: wager.placedAt,
          game: getSnapshot("soc-rma-01")!.game,
          bets: [...history, wager].map((w, i) => ({
            userId: "a",
            wager: { ...w, id: String(i) },
          })),
        },
      ]}
    />,
  );
  expect(document.querySelectorAll(".group-pick")).toHaveLength(3);
  expect(document.querySelectorAll(".group-match-team")).toHaveLength(2);
  expect(document.querySelector(".group-pick-selection")).not.toHaveTextContent(
    /^Home$/,
  );
  fireEvent.click(screen.getByRole("button", { name: "Show all bets" }));
  expect(document.querySelectorAll(".group-pick")).toHaveLength(4);
  expect(
    screen.getByRole("link", { name: "Match & comments" }),
  ).toHaveAttribute("href", "/games/soc-rma-01?discussion=1#group-discussion");
});
it("preserves unavailable historical match labels", () => {
  render(
    <GroupActivity
      viewerId="a"
      members={[]}
      matches={[
        {
          canonicalGameId: "one",
          latestActivity: wager.placedAt,
          bets: [{ userId: "a", wager }],
        },
      ]}
    />,
  );
  expect(screen.getByRole("link", { name: wager.matchup })).toBeVisible();
});
it("distinguishes the viewer and formats zero without a plus in Spanish", () => {
  render(
    <LanguageProvider locale="es">
      <GroupStandings
        viewerId="a"
        entries={[
          {
            userId: "a",
            name: "Oscar",
            won: 1,
            lost: 0,
            voided: 0,
            wagerCount: 1,
            netReturn: 280,
          },
          {
            userId: "b",
            name: "Oscar",
            won: 0,
            lost: 0,
            voided: 0,
            wagerCount: 0,
            netReturn: 0,
          },
        ]}
      />
    </LanguageProvider>,
  );
  expect(screen.getByText("Tú")).toBeVisible();
  expect(screen.getByText("Créditos netos")).toBeVisible();
  expect(screen.queryByText("+0")).not.toBeInTheDocument();
});
