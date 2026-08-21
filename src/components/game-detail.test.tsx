import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GameDetail } from "@/components/game-detail";
import { createEvidenceBriefing } from "@/lib/briefing";
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
      <GameDetail
        data={{
          snapshot,
          briefing: createEvidenceBriefing(snapshot, team),
        }}
        team={team}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "View demo brief" }));

    const brief = container.querySelector(".brief-list")!;
    expect(brief.textContent).toContain(
      `Scheduled time: ${formatDateTime(scheduledAt)}`,
    );

    const evidence = container.querySelector(".evidence-list")!;
    expect(evidence.textContent).toContain(formatDateTime(scheduledAt));

    expect(container.textContent).not.toContain(scheduledAt);
  });

  const renderGame = (game: GameSnapshot["game"]) =>
    render(
      <GameDetail
        data={{
          snapshot: { ...snapshot, game },
          briefing: createEvidenceBriefing({ ...snapshot, game }, team),
        }}
        team={team}
      />,
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

describe("GameDetail markets panel", () => {
  beforeEach(() => {
    useMatchdayStore.setState({ ...createDefaultState(), hydrated: true });
  });

  afterEach(cleanup);

  const renderGame = (game: GameSnapshot["game"]) =>
    render(
      <GameDetail
        data={{
          snapshot: { ...snapshot, game },
          briefing: createEvidenceBriefing({ ...snapshot, game }, team),
        }}
        team={team}
      />,
    ).container;

  const marketsPanel = (container: HTMLElement) =>
    container.querySelector('section[aria-labelledby="markets-heading"]')!;

  it("renders one entry per market for the game's sport", () => {
    const soccer = renderGame(snapshot.game);
    expect(
      marketsPanel(soccer).querySelectorAll(".panel-body > div").length,
    ).toBe(4);
    cleanup();

    const baseballBase = getSnapshot("mlb-nyy-01")!;
    const baseballTeam = getTeam(baseballBase.game.teamSlug)!;
    const { container: baseball } = render(
      <GameDetail
        data={{
          snapshot: baseballBase,
          briefing: createEvidenceBriefing(baseballBase, baseballTeam),
        }}
        team={baseballTeam}
      />,
    );
    expect(
      marketsPanel(baseball).querySelectorAll(".panel-body > div").length,
    ).toBe(2);
  });

  it("renders prices in two-decimal form", () => {
    const container = renderGame(snapshot.game);
    // Match Result "Home" is priced at 2.4 in the static house catalogue.
    expect(marketsPanel(container).textContent).toContain("2.40");
  });

  it("marks the winning selection on a finished game, leaving the loser untagged", () => {
    const finished = renderGame({
      ...snapshot.game,
      status: "finished",
      result: {
        homeScore: 2,
        awayScore: 1,
        source: "football-data",
        observedAt: snapshot.freshness.fetchedAt,
      },
    });
    const rows = Array.from(
      marketsPanel(finished).querySelectorAll(".data-pair"),
    );
    const homeRow = rows.find(
      (row) => row.querySelector("span")?.textContent === "Home",
    )!;
    const awayRow = rows.find(
      (row) => row.querySelector("span")?.textContent === "Away",
    )!;
    expect(homeRow.querySelector(".status-positive")).toBeTruthy();
    expect(awayRow.querySelector(".status-positive")).toBeFalsy();
  });

  it("renders no outcome tags when the game has no result", () => {
    const upcoming = renderGame(snapshot.game);
    expect(
      marketsPanel(upcoming)
        .querySelector(".panel-body")!
        .querySelectorAll(".status-tag").length,
    ).toBe(0);
  });

  it("no longer claims that no odds are produced", () => {
    const container = renderGame(snapshot.game);
    expect(container.textContent).not.toContain(
      "No predictions, odds, or betting advice are produced.",
    );
  });
});
