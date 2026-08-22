import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BetSlip, type WagerPanelData } from "@/components/bet-slip";
import type { Wager } from "@/lib/contracts";
import { marketsFor } from "@/lib/markets";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
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
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("BetSlip - unavailable and closed", () => {
  it("shows the unavailable message with no grid", () => {
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
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the specific closed reason, naming a next action, with no grid", () => {
    const data: WagerPanelData = {
      signedIn: true,
      routeId: "soc-rma-01",
      state: { kind: "closed", reason: "finished" },
      wagers: [],
    };
    render(<BetSlip data={data} />);

    expect(
      screen.getByText("This game has finished. Your record is on /you."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("BetSlip - open", () => {
  const soccerMarkets = marketsFor("soccer");
  const openData = (
    overrides: Partial<{
      balance: number;
      groups: { id: string; name: string }[];
      byMarket: {
        key: string;
        label: string;
        won: number;
        lost: number;
        voided: number;
      }[];
      groupPicks: {
        wager: Wager;
        userName: string | null;
        groupName: string;
      }[];
    }> = {},
  ): WagerPanelData => ({
    signedIn: true,
    routeId: "soc-rma-01",
    state: {
      kind: "open",
      markets: soccerMarkets,
      balance: 1000,
      groups: [],
      byMarket: [],
      groupPicks: [],
      ...overrides,
    },
    wagers: [],
  });

  it("renders every market's selections as priced buttons, with no selection armed yet", () => {
    render(<BetSlip data={openData()} />);

    expect(
      screen.getByRole("group", { name: "Match Result" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Home2.40" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Stake")).not.toBeInTheDocument();
  });

  it("arms the slip in one tap and shows the armed selection, stake, and returns", () => {
    render(<BetSlip data={openData()} />);

    fireEvent.click(screen.getByRole("button", { name: "Home2.40" }));

    expect(screen.getByRole("button", { name: "Home2.40" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const stakeInput = screen.getByLabelText("Stake") as HTMLInputElement;
    expect(stakeInput.value).toBe("1"); // MIN_STAKE default
    expect(screen.getByText("Returns").nextElementSibling?.textContent).toBe(
      "2",
    ); // round(1 * 2.4)
    expect(
      screen.getByRole("button", { name: "Place 1 → returns 2" }),
    ).toBeInTheDocument();
  });

  it("changing market does not silently reset the armed selection's own market/selection pick", () => {
    render(<BetSlip data={openData()} />);

    fireEvent.click(screen.getByRole("button", { name: "Home2.40" }));
    // Tapping a selection in a different market re-arms cleanly rather than
    // being blocked or losing state — there is no separate market dropdown
    // left to reset it out from under the user.
    fireEvent.click(screen.getByRole("button", { name: "Over 2.51.90" }));

    expect(
      screen.getByRole("button", { name: "Over 2.51.90" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Home2.40" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("quick-add chips move the stake, bounded by balance", () => {
    render(<BetSlip data={openData({ balance: 20 })} />);
    fireEvent.click(screen.getByRole("button", { name: "Home2.40" }));

    fireEvent.click(screen.getByRole("button", { name: "+5" }));
    expect((screen.getByLabelText("Stake") as HTMLInputElement).value).toBe(
      "6",
    );
    fireEvent.click(screen.getByRole("button", { name: "max" }));
    expect((screen.getByLabelText("Stake") as HTMLInputElement).value).toBe(
      "20",
    );
  });

  it("shows the record reaction line only for a market with settled history", () => {
    render(
      <BetSlip
        data={openData({
          byMarket: [
            {
              key: "soccer-match-result",
              label: "Match Result",
              won: 3,
              lost: 6,
              voided: 0,
            },
          ],
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Home2.40" }));
    expect(screen.getByText("You’re 3-6 on Match Result.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Over 2.51.90" }));
    expect(screen.queryByText(/You’re \d+-\d+ on/)).not.toBeInTheDocument();
  });

  it("offers no group selector when the account belongs to no groups, but prompts to create one", () => {
    render(<BetSlip data={openData()} />);
    fireEvent.click(screen.getByRole("button", { name: "Home2.40" }));
    expect(screen.queryByLabelText("Place")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Create a group" }),
    ).toHaveAttribute("href", "/groups/new");
  });

  it("offers a group selector defaulting to Alone when the account belongs to a group", () => {
    render(
      <BetSlip
        data={openData({ groups: [{ id: "group-1", name: "Sunday League" }] })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Home2.40" }));

    const select = screen.getByLabelText("Place") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(
      screen.getByRole("option", { name: "With Sunday League" }),
    ).toBeInTheDocument();
  });

  it("names another member's group pick above the grid", () => {
    const pick: Wager = {
      id: "wager-2",
      routeId: "soc-rma-01",
      canonicalGameId: "football-data-1",
      groupId: "group-1",
      sport: "soccer",
      marketId: "soccer-total-2-5",
      marketLabel: "Total goals",
      selectionId: "over",
      selectionLabel: "Over",
      line: 2.5,
      price: 1.9,
      stake: 25,
      potentialReturn: 47,
      matchup: "Barcelona at Real Madrid",
      competition: "La Liga",
      scheduledAt: "2099-01-01T00:00:00.000Z",
      placedAt: "2026-08-20T12:00:00.000Z",
      settled: false,
    };
    render(
      <BetSlip
        data={openData({
          groupPicks: [
            { wager: pick, userName: "Dani", groupName: "Sunday League" },
          ],
        })}
      />,
    );

    expect(
      screen.getByText("Sunday League — Dani has 25 on Over 2.5."),
    ).toBeInTheDocument();
  });

  it("renders this account's wagers on this game below the grid", () => {
    const base = openData();
    if (!base.signedIn) throw new Error("unreachable");
    const data: WagerPanelData = {
      ...base,
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

    const heading = screen.getByText("Your wagers on this game");
    expect(heading).toBeInTheDocument();
    expect(heading.parentElement?.textContent).toContain("Home");
    expect(heading.parentElement?.textContent).toContain("60");
  });

  it("grades a settled wager in the list instead of leaving it looking open (Phase B regression)", () => {
    const base = openData();
    if (!base.signedIn) throw new Error("unreachable");
    const data: WagerPanelData = {
      ...base,
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
          scheduledAt: "2026-01-01T00:00:00.000Z",
          placedAt: "2026-01-01T12:00:00.000Z",
          settled: true,
          settlement: {
            outcome: "won",
            returned: 60,
            settledAt: "2026-01-02T00:00:00.000Z",
          },
        },
      ],
    };
    render(<BetSlip data={data} />);

    expect(screen.getByText("won")).toBeInTheDocument();
  });
});
