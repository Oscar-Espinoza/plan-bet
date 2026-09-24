import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LanguageProvider } from "./language-provider";
import { BetSlip } from "./bet-slip";
import { ResetBankroll } from "./reset-bankroll";
import { BetsHistory } from "./bets-history";
import { marketsFor } from "@/lib/markets";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
afterEach(cleanup);
describe("Spanish interface", () => {
  it("translates markets and actions while preserving stake input when language changes", () => {
    const slip = (
      <BetSlip
        data={{
          signedIn: true,
          routeId: "soc-rma-01",
          state: {
            kind: "open",
            markets: marketsFor("soccer"),
            balance: 1000,
            groups: [],
            byMarket: [],
          },
          wagers: [],
          groupPicks: [],
          threads: [],
        }}
      />
    );
    const { rerender } = render(
      <LanguageProvider locale="es">{slip}</LanguageProvider>,
    );
    expect(screen.getByText("Haz una apuesta")).toBeInTheDocument();
    expect(screen.getByText("Resultado del partido")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Local.*2,40/ }));
    const stake = screen.getByLabelText("Monto");
    fireEvent.change(stake, { target: { value: "125" } });
    expect(
      screen.getByRole("button", { name: "Apostar 125 créditos" }),
    ).toBeInTheDocument();
    rerender(<LanguageProvider locale="en">{slip}</LanguageProvider>);
    expect(screen.getByLabelText("Stake")).toHaveValue("125");
    expect(
      screen.getByRole("button", { name: "Place 125 credits" }),
    ).toBeInTheDocument();
  });
  it("translates an open confirmation dialog when the locale changes", async () => {
    const { rerender } = render(
      <LanguageProvider locale="en">
        <ResetBankroll />
      </LanguageProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reset bankroll" }));
    rerender(
      <LanguageProvider locale="es">
        <ResetBankroll />
      </LanguageProvider>,
    );
    expect(
      await screen.findByRole("alertdialog", {
        name: "¿Restablecer tu saldo?",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cancelar" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Reset your bankroll?")).not.toBeInTheDocument();
  });
  it("translates empty states passed from server pages", () => {
    render(
      <LanguageProvider locale="es">
        <BetsHistory
          items={[]}
          emptyState={{
            title: "No wagers yet",
            copy: "Place a free-to-play wager from a game page to see your history here.",
          }}
        />
      </LanguageProvider>,
    );
    expect(screen.getByText("Aún no hay apuestas")).toBeInTheDocument();
    expect(screen.getByText("Ver próximos partidos")).toBeInTheDocument();
  });
});
