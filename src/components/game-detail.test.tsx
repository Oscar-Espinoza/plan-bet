import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GameDetail } from "@/components/game-detail";
import { createEvidenceBriefing } from "@/lib/briefing";
import { allGames, getSnapshot, getTeam } from "@/lib/seed";
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
    useMatchdayStore.getState().resetDemo();
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
