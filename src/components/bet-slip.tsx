"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LocalDateTime } from "@/components/local-date-time";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import type { GameStatus, Wager } from "@/lib/contracts";
import { MAX_STAKE, MIN_STAKE, type Market } from "@/lib/markets";

export type WagerPanelState =
  | { kind: "unavailable" }
  | { kind: "closed"; reason: GameStatus | "started" }
  | {
      kind: "open";
      markets: Market[];
      balance: number;
      groups: { id: string; name: string }[];
    };

export type WagerPanelData =
  | { signedIn: false; routeId: string }
  | {
      signedIn: true;
      routeId: string;
      state: WagerPanelState;
      wagers: Wager[];
    };

const CLOSED_LABELS: Record<GameStatus | "started", string> = {
  scheduled: "This game is not open for wagers.", // unreachable: scheduled is the open state
  started: "This game has already started.",
  live: "This game is already in progress.",
  finished: "This game has finished.",
  postponed: "This game has been postponed.",
  cancelled: "This game has been cancelled.",
  unknown: "This game is not open for wagers.",
};

function lineSuffix(line: number | undefined) {
  return typeof line === "number" ? ` ${line}` : "";
}

export function BetSlip({ data }: { data: WagerPanelData }) {
  const router = useRouter();
  const openMarkets =
    data.signedIn && data.state.kind === "open" ? data.state.markets : [];
  const [marketId, setMarketId] = useState(openMarkets[0]?.id ?? "");
  const market = openMarkets.find((m) => m.id === marketId) ?? openMarkets[0];
  const [selectionId, setSelectionId] = useState(
    market?.selections[0]?.id ?? "",
  );
  const selection =
    market?.selections.find((s) => s.id === selectionId) ??
    market?.selections[0];
  const [stake, setStake] = useState(MIN_STAKE);
  const [groupId, setGroupId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const balance =
    data.signedIn && data.state.kind === "open" ? data.state.balance : 0;
  const groups =
    data.signedIn && data.state.kind === "open" ? data.state.groups : [];
  const potentialReturn = selection ? Math.round(stake * selection.price) : 0;
  const balanceAfter = balance - stake;
  const insufficientCredits = stake > balance;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!market || !selection) return;
    setPending(true);
    setError("");
    const response = await fetch("/api/bets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        routeId: data.routeId,
        marketId: market.id,
        selectionId: selection.id,
        price: selection.price,
        stake,
        groupId: groupId || undefined,
      }),
    }).catch(() => null);
    setPending(false);

    if (!response?.ok) {
      const payload: unknown = await response?.json().catch(() => null);
      const text =
        payload && typeof payload === "object" && "error" in payload
          ? String(
              (payload as { error: { message?: string } }).error?.message ?? "",
            )
          : "";
      setError(text || "The wager did not go through. Try again.");
      return;
    }
    setMessage("Wager placed.");
    setStake(MIN_STAKE);
    setGroupId("");
    router.refresh();
  };

  if (!data.signedIn) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Wager</h2>
        </div>
        <div className="side-form">
          <p>
            <Link href={`/sign-in?callbackUrl=/games/${data.routeId}`}>
              Sign in
            </Link>{" "}
            to place a free-to-play wager.
          </p>
        </div>
      </section>
    );
  }

  const { state, wagers } = data;

  return (
    <section className="panel" aria-labelledby="wager-heading">
      <div className="panel-header">
        <h2 className="panel-title" id="wager-heading">
          Wager
        </h2>
      </div>

      {state.kind === "unavailable" && (
        <p className="side-form">This game is not available for wagers.</p>
      )}
      {state.kind === "closed" && (
        <p className="side-form">{CLOSED_LABELS[state.reason]}</p>
      )}

      {state.kind === "open" && market && selection && (
        <form className="side-form" onSubmit={submit}>
          <label htmlFor="wager-market" className="field-label">
            Market
          </label>
          <select
            id="wager-market"
            className="field"
            value={market.id}
            onChange={(event) => {
              const next = openMarkets.find((m) => m.id === event.target.value);
              setMarketId(event.target.value);
              setSelectionId(next?.selections[0]?.id ?? "");
            }}
          >
            {openMarkets.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>

          <label htmlFor="wager-selection" className="field-label">
            Selection
          </label>
          <select
            id="wager-selection"
            className="field"
            value={selection.id}
            onChange={(event) => setSelectionId(event.target.value)}
          >
            {market.selections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} · {s.price.toFixed(2)}
              </option>
            ))}
          </select>

          <label htmlFor="wager-stake" className="field-label">
            Stake
          </label>
          <input
            id="wager-stake"
            className="field"
            type="number"
            min={MIN_STAKE}
            max={MAX_STAKE}
            step={1}
            value={stake}
            onChange={(event) => setStake(Number(event.target.value))}
            required
          />

          {groups.length > 0 && (
            <>
              <label htmlFor="wager-group" className="field-label">
                Place
              </label>
              <select
                id="wager-group"
                className="field"
                value={groupId}
                onChange={(event) => setGroupId(event.target.value)}
              >
                <option value="">Alone</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    With {group.name}
                  </option>
                ))}
              </select>
            </>
          )}

          <div className="data-pair">
            <span>Potential return</span>
            <span>{potentialReturn}</span>
          </div>
          <div className="data-pair">
            <span>Balance after</span>
            <span>{balanceAfter}</span>
          </div>

          {insufficientCredits && (
            <Banner tone="negative" role="alert">
              Stake exceeds your balance of {balance}.
            </Banner>
          )}

          {error && (
            <Banner tone="negative" role="alert">
              {error}
            </Banner>
          )}

          {message && <Banner tone="positive">{message}</Banner>}

          <Button
            type="submit"
            className="w-full"
            disabled={pending || insufficientCredits}
          >
            Place wager
          </Button>
          <p className="fine-print">
            Fictional credits, house prices. See the{" "}
            <Link href="/rules">rules</Link>.
          </p>
        </form>
      )}

      {wagers.length > 0 && (
        <div className="side-form">
          <h3 className="field-label">Your wagers on this game</h3>
          {wagers.map((wager) => (
            <div className="data-pair" key={wager.id}>
              <span>
                {wager.selectionLabel}
                {lineSuffix(wager.line)}
              </span>
              <span>
                {wager.price.toFixed(2)} · {wager.stake} →{" "}
                {wager.potentialReturn}{" "}
                <LocalDateTime value={wager.placedAt} short />
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
