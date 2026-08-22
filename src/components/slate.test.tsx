import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Slate } from "@/components/slate";
import type { DashboardData } from "@/data/sports-data";
import type { Freshness, GameSchedule, Team } from "@/lib/contracts";

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

function freshness(mode: Freshness["mode"]): Freshness {
  return {
    mode,
    provider: "demo",
    sourceObservedAt: "2026-01-01T00:00:00.000Z",
    fetchedAt: "2026-01-01T00:00:00.000Z",
    attribution: { name: "Demo", url: "https://example.com" },
  };
}

function team(slug: Team["slug"], sport: Team["sport"], name: string): Team {
  return {
    slug,
    sport,
    name,
    shortName: name,
    abbreviation: "AAA",
    mark: "A",
    colors: { primary: "#000000", secondary: "#ffffff" },
    providerIds: {},
  };
}

function schedule(
  slug: Team["slug"],
  sport: Team["sport"],
  name: string,
  mode: Freshness["mode"],
): GameSchedule {
  return {
    team: team(slug, sport, name),
    games: [
      {
        id: `${slug}-1`,
        sport,
        teamSlug: slug,
        competition: "Test league",
        homeTeam: name,
        awayTeam: "Away",
        scheduledAt: "2026-01-02T00:00:00.000Z",
        status: "scheduled",
      },
    ],
    context:
      sport === "soccer"
        ? {
            kind: "soccer",
            recentForm: [],
            availability: [],
            matchupNotes: [],
          }
        : {
            kind: "baseball",
            recentForm: [],
            probablePitchers: [],
            availability: [],
          },
    freshness: freshness(mode),
  };
}

const data: DashboardData = {
  "real-madrid": schedule("real-madrid", "soccer", "Real Madrid", "demo"),
  barcelona: schedule("barcelona", "soccer", "Barcelona", "demo"),
  "new-york-yankees": schedule(
    "new-york-yankees",
    "baseball",
    "New York Yankees",
    "stale",
  ),
  "boston-red-sox": schedule(
    "boston-red-sox",
    "baseball",
    "Boston Red Sox",
    "stale",
  ),
};

afterEach(cleanup);

describe("Slate freshness stamps", () => {
  it("shows one stamp per sport when all games are shown", () => {
    render(<Slate data={data} sport="all" tz="UTC" />);
    expect(screen.getByText("Demo snapshot")).toBeInTheDocument();
    expect(screen.getByText("Stale live data")).toBeInTheDocument();
  });

  it("shows only the baseball stamp under a baseball filter", () => {
    render(<Slate data={data} sport="baseball" tz="UTC" />);
    expect(screen.queryByText("Demo snapshot")).not.toBeInTheDocument();
    expect(screen.getByText("Stale live data")).toBeInTheDocument();
  });

  it("shows only the soccer stamp under a soccer filter", () => {
    render(<Slate data={data} sport="soccer" tz="UTC" />);
    expect(screen.getByText("Demo snapshot")).toBeInTheDocument();
    expect(screen.queryByText("Stale live data")).not.toBeInTheDocument();
  });
});
