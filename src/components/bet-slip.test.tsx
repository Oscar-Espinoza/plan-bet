import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BetSlip, type WagerPanelData } from "@/components/bet-slip";
import { marketsFor } from "@/lib/markets";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
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

afterEach(cleanup);

describe("BetSlip - signed out", () => {
  it("renders a sign-in prompt linking back to this game instead of a disabled form", () => {
    const data: WagerPanelData = { signedIn: false, routeId: "soc-rma-01" };
    render(<BetSlip data={data} />);

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in?callbackUrl=/games/soc-rma-01",
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});

describe("BetSlip - unavailable and closed", () => {
  it("shows the unavailable message with no form when the route has no games row", () => {
    const data: WagerPanelData = {
      signedIn: true,
      routeId: "soc-rma-01",
      state: { kind: "unavailable" },
      wagers: [],
    };
    render(<BetSlip data={data} />);

    expect(
      screen.getByText("This game is not available for wagers."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Place wager" }),
    ).not.toBeInTheDocument();
  });

  it("shows the specific closed reason with no submit control", () => {
    const data: WagerPanelData = {
      signedIn: true,
      routeId: "soc-rma-01",
      state: { kind: "closed", reason: "finished" },
      wagers: [],
    };
    render(<BetSlip data={data} />);

    expect(screen.getByText("This game has finished.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Place wager" }),
    ).not.toBeInTheDocument();
  });
});

describe("BetSlip - open", () => {
  const soccerMarkets = marketsFor("soccer");

  it("shows a potential return equal to stake times the displayed price", () => {
    const data: WagerPanelData = {
      signedIn: true,
      routeId: "soc-rma-01",
      state: { kind: "open", markets: soccerMarkets, balance: 1000 },
      wagers: [],
    };
    render(<BetSlip data={data} />);

    const matchResult = soccerMarkets.find(
      (m) => m.id === "soccer-match-result",
    )!;
    const homeSelection = matchResult.selections.find((s) => s.id === "home")!;

    const stakeInput = screen.getByLabelText("Stake") as HTMLInputElement;
    expect(stakeInput.value).toBe("1"); // MIN_STAKE default

    const expected = Math.round(1 * homeSelection.price);
    expect(
      screen.getByText("Potential return").nextElementSibling?.textContent,
    ).toBe(String(expected));
  });

  it("is fully operable by keyboard: market, selection, and stake are all labelled form controls", () => {
    const data: WagerPanelData = {
      signedIn: true,
      routeId: "soc-rma-01",
      state: { kind: "open", markets: soccerMarkets, balance: 1000 },
      wagers: [],
    };
    render(<BetSlip data={data} />);

    expect(screen.getByLabelText("Market")).toBeInTheDocument();
    expect(screen.getByLabelText("Selection")).toBeInTheDocument();
    expect(screen.getByLabelText("Stake")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Place wager" }),
    ).toBeInTheDocument();
  });

  it("renders this account's wagers on this game below the form", () => {
    const data: WagerPanelData = {
      signedIn: true,
      routeId: "soc-rma-01",
      state: { kind: "open", markets: soccerMarkets, balance: 1000 },
      wagers: [
        {
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
          scheduledAt: "2099-01-01T00:00:00.000Z",
          placedAt: "2026-08-20T12:00:00.000Z",
          settled: false,
        },
      ],
    };
    render(<BetSlip data={data} />);

    expect(screen.getByText("Your wagers on this game")).toBeInTheDocument();
    expect(screen.getByText("Home")).toBeInTheDocument();
  });
});
