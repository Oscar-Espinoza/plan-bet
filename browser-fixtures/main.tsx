import { StrictMode, useEffect, useState } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { AppShell } from "@/components/app-shell";
import { GameDetail } from "@/components/game-detail";
import { BetSlip, type WagerPanelData } from "@/components/bet-slip";
import { RibbonContext } from "@/components/ribbon";
import { Slate, type SportFilter } from "@/components/slate";
import { BetsHistory } from "@/components/bets-history";
import { getSnapshot, getTeam } from "@/lib/seed";
import { marketsFor } from "@/lib/markets";
import { CLOSED_COPY, type WagerClosedReason } from "@/lib/wager-copy";
import { board, emptyBoard, history } from "./data";
import { useLocation } from "./navigation";
import Link from "./link";
import "@/app/globals.css";
import "@/app/games/[id]/matchup.css";

const open: WagerPanelData = {
  signedIn: true,
  routeId: "soc-rma-01",
  state: {
    kind: "open",
    markets: marketsFor("soccer"),
    balance: 1000,
    groups: [{ id: "group-1", name: "Sunday League" }],
    byMarket: [],
  },
  wagers: [],
  groupPicks: [],
  threads: [],
};

function DelayedTargets() {
  const [ready, setReady] = useState(false);
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 800);
    return () => clearTimeout(timer);
  }, []);
  return (
    <main>
      <h1>Delayed ribbon</h1>
      <RibbonContext
        value={{ clock: null, returns: null, feedback: null, action: target }}
      >
        <BetSlip data={open} />
        {ready && <div className="ribbon-action" ref={setTarget} />}
      </RibbonContext>
    </main>
  );
}

function Fixture() {
  const location = useLocation();
  const [pathname, query] = location.split("?");
  const params = new URLSearchParams(query);
  if (pathname === "/delayed") return <DelayedTargets />;
  const routeId = pathname?.split("/")[2] ?? "soc-rma-01";
  const baseSnapshot = getSnapshot(routeId) ?? getSnapshot("soc-rma-01")!;
  const scenario = params.get("state");
  const snapshot = { ...baseSnapshot, game: { ...baseSnapshot.game } };
  if (
    scenario === "live" ||
    scenario === "finished" ||
    scenario === "postponed" ||
    scenario === "cancelled"
  )
    snapshot.game.status = scenario;
  if (scenario === "finished")
    snapshot.game.result = {
      homeScore: 2,
      awayScore: 1,
      source: "demo",
      observedAt: "2026-09-15T12:00:00.000Z",
    };
  const state =
    scenario === "unavailable"
      ? { kind: "unavailable" as const }
      : scenario && scenario in CLOSED_COPY
        ? { kind: "closed" as const, reason: scenario as WagerClosedReason }
        : {
            kind: "open" as const,
            markets: marketsFor(snapshot.game.sport),
            balance: Number(params.get("balance") ?? 1000),
            groups: [{ id: "group-1", name: "Sunday League" }],
            byMarket: [],
          };
  const wagering: WagerPanelData =
    scenario === "signed-out"
      ? { signedIn: false, routeId }
      : {
          signedIn: true,
          routeId,
          state,
          wagers: [],
          groupPicks: [],
          threads: [],
        };
  const sport = (params.get("sport") ?? "all") as SportFilter;
  const data = params.has("empty") ? emptyBoard : board;
  return (
    <AppShell
      accountControl={
        <Link
          className="account-standing"
          href="/you"
          aria-label="Balance 1000 credits, record 14 won 15 lost"
        >
          <span>
            1,000 <small>CR</small>
          </span>
          <small>
            {params.has("long")
              ? "14–15 · 123 open wagers with a very long account description"
              : "14–15"}
          </small>
        </Link>
      }
    >
      {pathname === "/" ? (
        <Slate data={data} sport={sport} tz="America/Argentina/Buenos_Aires" />
      ) : pathname === "/you" ? (
        <>
          <h1>Your record</h1>
          <BetsHistory
            items={history}
            emptyState={{ title: "No wagers", copy: "" }}
          />
        </>
      ) : pathname?.startsWith("/games/") ? (
        <GameDetail
          key={location}
          data={{ snapshot }}
          team={getTeam(snapshot.game.teamSlug)!}
          wagering={wagering}
        />
      ) : (
        <h1>Sign in</h1>
      )}
    </AppShell>
  );
}
const root = document.getElementById("root")!;
const app = (
  <StrictMode>
    <Fixture />
  </StrictMode>
);
if (new URLSearchParams(window.location.search).has("hydrate")) {
  root.innerHTML = renderToString(app);
  hydrateRoot(root, app);
} else createRoot(root).render(app);
