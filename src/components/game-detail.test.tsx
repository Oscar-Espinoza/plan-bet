import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { GameDetail } from "@/components/game-detail";
import { allGames, getSnapshot, getTeam } from "@/lib/seed";
import { createDefaultState } from "@/lib/storage";
import { useMatchdayStore } from "@/lib/store";
import { formatDateTime } from "@/lib/utils";
import type { GameSnapshot } from "@/lib/contracts";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/games/test",
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const base = getSnapshot(allGames[0]!.id)!;
const team = getTeam(base.game.teamSlug)!;
const scheduledAt = base.game.scheduledAt;

const snapshot: GameSnapshot = {
  ...base,
  evidenceFacts: [
    {
      id: `${base.game.id}-fact-schedule`,
      label: "Scheduled time",
      value: scheduledAt,
      valueType: "datetime",
      sourceId: base.sources[0]!.id,
      observedAt: base.freshness.fetchedAt,
    },
    ...base.evidenceFacts,
  ],
};

describe("GameDetail evidence rendering", () => {
  beforeEach(() => {
    useMatchdayStore.setState({ ...createDefaultState(), hydrated: true });
  });

  afterEach(cleanup);

  it("renders datetime evidence in the browser timezone, never as a raw timestamp", () => {
    const { container } = render(
      <GameDetail data={{ snapshot }} team={team} />,
    );

    const evidence = container.querySelector(".evidence-list")!;
    expect(evidence.textContent).toContain(formatDateTime(scheduledAt));

    expect(container.textContent).not.toContain(scheduledAt);
  });

  const renderGame = (game: GameSnapshot["game"]) =>
    render(
      <GameDetail data={{ snapshot: { ...snapshot, game } }} team={team} />,
    ).container;

  it("shows the final score only once a result is reported", () => {
    // No result: the matchup reads as an upcoming fixture.
    const upcoming = renderGame(snapshot.game);
    expect(upcoming.querySelector(".matchup-vs")?.textContent).toContain("vs");
    expect(upcoming.querySelector(".matchup-vs")?.textContent).not.toMatch(
      /\d+\s–\s\d+/,
    );
    cleanup();

    // A goalless finished draw is a reported score, not a missing one.
    const finished = renderGame({
      ...snapshot.game,
      status: "finished",
      result: {
        homeScore: 0,
        awayScore: 0,
        source: "football-data",
        observedAt: snapshot.freshness.fetchedAt,
      },
    });
    expect(finished.querySelector(".matchup-vs")?.textContent).toContain(
      "0 – 0",
    );
    expect(finished.querySelector("h1")?.textContent).toContain("final");
  });

  it("names extra time so a 90-minute reading is never implied", () => {
    const container = renderGame({
      ...snapshot.game,
      status: "finished",
      result: {
        homeScore: 2,
        awayScore: 1,
        completion: "shootout",
        source: "football-data",
        observedAt: snapshot.freshness.fetchedAt,
      },
    });
    expect(container.querySelector(".matchup-vs")?.textContent).toContain(
      "After penalties",
    );
  });
});

// The static market table (grid of house prices + grading tags) that used to
// live here is gone: B2 of the slate/slip rework absorbed it into BetSlip's
// selection grid, which now renders those same prices only when a wager is
// actually placeable. Coverage for the grid itself lives in bet-slip.test.tsx.
