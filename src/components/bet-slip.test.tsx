import { placement } from "../../browser-fixtures/data";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { BetSlip, type WagerPanelData } from "@/components/bet-slip";
import type { CommentThreadView } from "@/components/game-thread";
import type { Wager } from "@/lib/contracts";
import { marketsFor } from "@/lib/markets";

const refresh = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
  useSearchParams: () => searchParams,
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  searchParams = new URLSearchParams();
});

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
      groupPicks: [],
      threads: [],
    };
    render(<BetSlip data={data} />);

    expect(
      screen.getByText("This game is not open for bets."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the specific closed reason, naming a next action, with no grid", () => {
    const data: WagerPanelData = {
      signedIn: true,
      routeId: "soc-rma-01",
      state: { kind: "closed", reason: "finished" },
      wagers: [],
      groupPicks: [],
      threads: [],
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
      threads: CommentThreadView[];
    }> = {},
  ): WagerPanelData => {
    const { groupPicks, threads, ...stateOverrides } = overrides;
    return {
      signedIn: true,
      routeId: "soc-rma-01",
      state: {
        kind: "open",
        markets: soccerMarkets,
        balance: 1000,
        groups: [],
        byMarket: [],
        ...stateOverrides,
      },
      wagers: [],
      groupPicks: groupPicks ?? [],
      threads: threads ?? [],
    };
  };

  it("uses the confirmed balance immediately without waiting for a route refresh", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ data: placement }), { status: 201 }),
        ),
    );
    render(<BetSlip data={openData()} />);
    fireEvent.click(screen.getByRole("button", { name: "Home2.40" }));
    fireEvent.change(screen.getByLabelText("Stake"), {
      target: { value: "25" },
    });
    fireEvent.submit(
      (screen.getByLabelText("Stake") as HTMLInputElement).form!,
    );
    await waitFor(() =>
      expect(screen.getByText(/New balance: 975/)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Home2.40" }));
    fireEvent.change(screen.getByLabelText("Stake"), {
      target: { value: "976" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Stake exceeds your balance of 975",
    );
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

  it("preserves the selected team threshold and stake when categories change", () => {
    render(
      <BetSlip
        data={openData()}
        matchup={{ home: "Real Madrid", away: "Barcelona" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Teams" }));
    fireEvent.click(
      screen.getAllByRole("button", { name: "2+ goals2.50" })[0]!,
    );
    fireEvent.change(screen.getByLabelText("Stake"), {
      target: { value: "25" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Popular" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Real Madrid — 2+ goals",
    );
    expect(screen.getByLabelText("Stake")).toHaveValue(25);
    fireEvent.click(screen.getByRole("button", { name: "Teams" }));
    expect(
      screen.getAllByRole("button", { name: "2+ goals2.50" })[0],
    ).toHaveAttribute("aria-pressed", "true");
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
      screen.getByRole("button", { name: "Place 1 credits" }),
    ).toBeInTheDocument();
  });

  it("pre-arms the selection named by ?pick=, resolved against this game's real markets", () => {
    searchParams = new URLSearchParams({
      pick: `${soccerMarkets[0]!.id}:${soccerMarkets[0]!.selections[0]!.id}`,
    });
    render(<BetSlip data={openData()} />);

    expect(screen.getByRole("button", { name: "Home2.40" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("arms an exact score once both figures are typed, and only for a priced line", () => {
    render(
      <BetSlip
        data={openData()}
        matchup={{ home: "Real Madrid", away: "FC Barcelona" }}
      />,
    );

    const home = screen.getByLabelText("Real Madrid goals");
    const away = screen.getByLabelText("FC Barcelona goals");

    // One figure is not a scoreline: nothing is picked and nothing is priced.
    fireEvent.change(home, { target: { value: "2" } });
    expect(screen.getByText("Type a score")).toBeInTheDocument();

    fireEvent.change(away, { target: { value: "1" } });
    expect(screen.getByText("Pays 8.50")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Place 1 credits" }),
    ).toBeInTheDocument();

    // 4-1 is outside the published grid, so it resolves to no selection and
    // takes the form back down with it rather than inventing a price.
    fireEvent.change(home, { target: { value: "4" } });
    expect(
      screen.getByText("Not priced — 0-0 through 3-3 only"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Place/ }),
    ).not.toBeInTheDocument();
  });

  it("pre-fills the score entry from the buddy's ?pick= deep link", () => {
    searchParams = new URLSearchParams({ pick: "soccer-exact-score:2-1" });
    render(
      <BetSlip
        data={openData()}
        matchup={{ home: "Real Madrid", away: "FC Barcelona" }}
      />,
    );

    expect(
      (screen.getByLabelText("Real Madrid goals") as HTMLInputElement).value,
    ).toBe("2");
    expect(
      (screen.getByLabelText("FC Barcelona goals") as HTMLInputElement).value,
    ).toBe("1");
    expect(screen.getByText("Pays 8.50")).toBeInTheDocument();
  });

  it("silently ignores a ?pick= that doesn't resolve to a real market or selection", () => {
    searchParams = new URLSearchParams({ pick: "not-a-real-market:over" });
    render(<BetSlip data={openData()} />);

    expect(screen.queryByRole("button", { name: "Home2.40" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
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

  it("lets the field be cleared and retyped, which snapping to 1 prevented", () => {
    render(<BetSlip data={openData({ balance: 1000 })} />);
    fireEvent.click(screen.getByRole("button", { name: "Home2.40" }));
    const stakeInput = screen.getByLabelText("Stake") as HTMLInputElement;

    // Clearing used to be impossible: `Number("") || MIN_STAKE` put 1 back.
    fireEvent.change(stakeInput, { target: { value: "" } });
    expect(stakeInput.value).toBe("");
    expect(
      screen.getByRole("button", { name: "Enter a stake" }),
    ).toBeDisabled();

    fireEvent.change(stakeInput, { target: { value: "750" } });
    expect(stakeInput.value).toBe("750");
    expect(
      screen.getByRole("button", { name: "Place 750 credits" }),
    ).toBeEnabled();
  });

  it("accepts a stake far above the old published cap", () => {
    render(<BetSlip data={openData({ balance: 20000 })} />);
    fireEvent.click(screen.getByRole("button", { name: "Home2.40" }));
    fireEvent.change(screen.getByLabelText("Stake"), {
      target: { value: "12345" },
    });
    expect(
      screen.getByRole("button", { name: "Place 12345 credits" }),
    ).toBeEnabled();
  });

  it("warns and disables above the balance without rewriting what was typed", () => {
    render(<BetSlip data={openData({ balance: 20 })} />);
    fireEvent.click(screen.getByRole("button", { name: "Home2.40" }));
    const stakeInput = screen.getByLabelText("Stake") as HTMLInputElement;

    fireEvent.change(stakeInput, { target: { value: "21" } });
    expect(stakeInput.value).toBe("21");
    expect(
      screen.getByRole("button", { name: "Place 21 credits" }),
    ).toBeDisabled();
    expect(
      screen.getByText("Stake exceeds your balance of 20."),
    ).toBeInTheDocument();
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
      screen.getByText("Sunday League — Dani: 25 · Over 2.5"),
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

    const heading = screen.getByText("Your bets on this game");
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

// Phase F: groupPicks used to live only inside the "open" arm of
// WagerPanelState, so a game going "closed" at kickoff hid it.
describe("BetSlip - group picks outlive kickoff", () => {
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
    scheduledAt: "2026-01-01T00:00:00.000Z",
    placedAt: "2025-12-30T12:00:00.000Z",
    settled: false,
  };

  it("still shows a group pick once the game has closed", () => {
    const data: WagerPanelData = {
      signedIn: true,
      routeId: "soc-rma-01",
      state: { kind: "closed", reason: "finished" },
      wagers: [],
      groupPicks: [
        { wager: pick, userName: "Dani", groupName: "Sunday League" },
      ],
      threads: [],
    };
    render(<BetSlip data={data} />);

    expect(
      screen.getByText("Sunday League — Dani: 25 · Over 2.5"),
    ).toBeInTheDocument();
  });
});

// Same shape as groupPicks above: threads render off WagerPanelData directly,
// in every panel state, not gated on state.kind === "open".
describe("BetSlip - comment threads", () => {
  it("leaves discussion rendering to the separate match section", () => {
    const data: WagerPanelData = {
      signedIn: true,
      routeId: "soc-rma-01",
      state: { kind: "closed", reason: "finished" },
      wagers: [],
      groupPicks: [],
      threads: [
        {
          groupId: "group-1",
          groupName: "Sunday League",
          comments: [],
          hasCommented: false,
          postingPhase: "after",
          viewerSelectionLabel: null,
          pins: {},
        },
      ],
    };
    render(<BetSlip data={data} />);

    expect(
      screen.queryByRole("heading", { name: "Sunday League" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Say something")).not.toBeInTheDocument();
  });
});
