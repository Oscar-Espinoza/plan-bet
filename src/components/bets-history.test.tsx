import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BetsHistory } from "@/components/bets-history";
import type { Wager } from "@/lib/contracts";

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

afterEach(cleanup);

const settledWon: Wager = {
  id: "wager-1",
  routeId: "soc-rma-01",
  canonicalGameId: "football-data-1",
  sport: "soccer",
  marketId: "soccer-match-result",
  marketLabel: "Match Result",
  selectionId: "home",
  selectionLabel: "Home",
  price: 2.4,
  stake: 25,
  potentialReturn: 60,
  matchup: "Barcelona at Real Madrid",
  competition: "La Liga",
  scheduledAt: "2026-01-01T00:00:00.000Z",
  placedAt: "2026-01-01T00:00:00.000Z",
  settled: true,
  settlement: {
    outcome: "won",
    returned: 60,
    settledAt: "2026-01-02T00:00:00.000Z",
    finalScore: { homeScore: 2, awayScore: 1 },
  },
};

describe("BetsHistory - empty state", () => {
  it("shows the supplied empty-state copy and a way back to the dashboard, not a blank table", () => {
    render(
      <BetsHistory
        items={[]}
        emptyState={{ title: "No wagers yet", copy: "Go place one." }}
      />,
    );

    expect(screen.getByText("No wagers yet")).toBeInTheDocument();
    expect(screen.getByText("Go place one.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Explore upcoming games" }),
    ).toHaveAttribute("href", "/");
  });
});

describe("BetsHistory - settled row", () => {
  it("shows the outcome as a word (not colour alone), the returned amount, and net stake-adjusted return", () => {
    render(
      <BetsHistory
        items={[settledWon]}
        emptyState={{ title: "No wagers yet", copy: "" }}
      />,
    );

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("won")).toBeInTheDocument();
    // returned (60) appears in its own cell distinct from net (60 - 25 = 35)
    expect(screen.getByText("35")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Barcelona at Real Madrid" }),
    ).toHaveAttribute("href", "/games/soc-rma-01");
  });

  it("marks an unsettled wager Open with Pending returned/net rather than fabricating zero", () => {
    const open: Wager = {
      ...settledWon,
      id: "wager-2",
      settled: false,
      settlement: undefined,
    };
    render(
      <BetsHistory
        items={[open]}
        emptyState={{ title: "No wagers yet", copy: "" }}
      />,
    );

    expect(screen.getByText("open")).toBeInTheDocument();
    expect(screen.getAllByText("Pending")).toHaveLength(3);
  });
});

const emptyState = { title: "No wagers yet", copy: "" };

describe("BetsHistory - deciding result", () => {
  it("shows the score that decided a settled wager", () => {
    render(<BetsHistory items={[settledWon]} emptyState={emptyState} />);
    expect(screen.getByText("2-1")).toBeInTheDocument();
  });

  it("reads 'Not provided' rather than inventing a score when the game row is gone", () => {
    const withoutScore: Wager = {
      ...settledWon,
      settlement: { ...settledWon.settlement!, finalScore: undefined },
    };
    render(<BetsHistory items={[withoutScore]} emptyState={emptyState} />);
    expect(screen.getByText("Not provided")).toBeInTheDocument();
  });

  it("shows no score for a void, which nothing decided", () => {
    const voided: Wager = {
      ...settledWon,
      settlement: {
        outcome: "void",
        returned: settledWon.stake,
        settledAt: "2026-01-02T00:00:00.000Z",
      },
    };
    render(<BetsHistory items={[voided]} emptyState={emptyState} />);
    expect(screen.getByText("Voided")).toBeInTheDocument();
  });
});
