"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LocalDateTime } from "@/components/local-date-time";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { StatusTag } from "@/components/ui/status-tag";
import {
  wagerPlacementResultSchema,
  type RecordSlice,
  type Wager,
} from "@/lib/contracts";
import { MAX_STAKE, MIN_STAKE, type Market } from "@/lib/markets";
import { useMatchdayStore } from "@/lib/store";
import {
  CLOSED_COPY,
  outcomeTone,
  settlementLabel,
  type WagerClosedReason,
} from "@/lib/wager-copy";
import { cn } from "@/lib/utils";

export type WagerPanelState =
  | { kind: "unavailable" }
  | { kind: "closed"; reason: WagerClosedReason }
  | {
      kind: "open";
      markets: Market[];
      balance: number;
      groups: { id: string; name: string }[];
      // Settled record for each market, keyed on market.id — getRecordSlices()
      // exactly as it already exists for /you, reused rather than a new
      // query. Empty when the account has no settled history at all.
      byMarket: RecordSlice[];
      // Other members' picks on this game, across every group the viewer
      // belongs to — empty for every solo user's normal state.
      groupPicks: {
        wager: Wager;
        userName: string | null;
        groupName: string;
      }[];
    };

export type WagerPanelData =
  | { signedIn: false; routeId: string }
  | {
      signedIn: true;
      routeId: string;
      state: WagerPanelState;
      wagers: Wager[];
    };

type ArmedSelection = { marketId: string; selectionId: string };

function lineSuffix(line: number | undefined) {
  return typeof line === "number" ? ` ${line}` : "";
}

function clampStake(value: number, balance: number) {
  return Math.min(MAX_STAKE, balance, Math.max(MIN_STAKE, value));
}

export function BetSlip({ data }: { data: WagerPanelData }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const advanceTour = useMatchdayStore((state) => state.advanceTour);
  const openMarkets =
    data.signedIn && data.state.kind === "open" ? data.state.markets : [];
  const balance =
    data.signedIn && data.state.kind === "open" ? data.state.balance : 0;
  const groups =
    data.signedIn && data.state.kind === "open" ? data.state.groups : [];
  const byMarket =
    data.signedIn && data.state.kind === "open" ? data.state.byMarket : [];
  const groupPicks =
    data.signedIn && data.state.kind === "open" ? data.state.groupPicks : [];

  // marketId/selectionId collapse into one armed selection: tapping a price
  // in the grid *is* the selection, so changing market never resets a pick
  // the way the old market-then-selection dropdown cascade did.
  //
  // The lazy initializer also resolves the buddy's "Back this" link, which
  // arrives as `?pick=<marketId>:<selectionId>` — read once, on mount, and
  // never trusted outright: an id that doesn't resolve against this game's
  // real markets is silently ignored, and the price shown here is still
  // re-read server-side at placement regardless of the querystring.
  const [armed, setArmed] = useState<ArmedSelection | undefined>(() => {
    const [marketId, selectionId] = searchParams.get("pick")?.split(":") ?? [];
    if (!marketId || !selectionId) return undefined;
    const market = openMarkets.find((m) => m.id === marketId);
    if (!market?.selections.some((s) => s.id === selectionId)) return undefined;
    return { marketId, selectionId };
  });
  const market = openMarkets.find((m) => m.id === armed?.marketId);
  const selection = market?.selections.find((s) => s.id === armed?.selectionId);
  const reaction = byMarket.find((slice) => slice.key === market?.id);
  const hasReaction =
    reaction && reaction.won + reaction.lost + reaction.voided > 0;

  const [stake, setStake] = useState(MIN_STAKE);
  const [groupId, setGroupId] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const potentialReturn = selection ? Math.round(stake * selection.price) : 0;
  const balanceAfter = balance - stake;
  const insufficientCredits = stake > balance;

  const arm = (marketId: string, selectionId: string) => {
    setArmed({ marketId, selectionId });
    setConfirmation("");
    setError("");
  };

  const addStake = (amount: number) =>
    setStake((current) => clampStake(current + amount, balance));

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

    const payload: unknown = await response?.json().catch(() => null);
    if (!response?.ok) {
      const text =
        payload && typeof payload === "object" && "error" in payload
          ? String(
              (payload as { error: { message?: string } }).error?.message ?? "",
            )
          : "";
      setError(text || "The wager did not go through. Try again.");
      return;
    }

    const result = wagerPlacementResultSchema.parse(
      (payload as { data: unknown }).data,
    );
    setConfirmation(
      `Placed ${result.wager.stake} on ${result.wager.selectionLabel}${lineSuffix(
        result.wager.line,
      )} → returns ${result.wager.potentialReturn}. New balance: ${result.summary.balance}.`,
    );
    setArmed(undefined);
    setStake(MIN_STAKE);
    setGroupId("");
    advanceTour(2);
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
        <p className="side-form">{CLOSED_COPY[state.reason]}</p>
      )}

      {confirmation && (
        <div className="side-form">
          <Banner tone="positive">{confirmation}</Banner>
        </div>
      )}

      {state.kind === "open" && groupPicks.length > 0 && (
        <div className="side-form">
          {groupPicks.map((pick) => (
            <p className="fine-print" key={pick.wager.id}>
              {pick.groupName} — {pick.userName ?? "A member"} has{" "}
              {pick.wager.stake} on {pick.wager.selectionLabel}
              {lineSuffix(pick.wager.line)}.
            </p>
          ))}
        </div>
      )}

      {state.kind === "open" && (
        <div className="selection-grid">
          {openMarkets.map((m) => (
            <div className="selection-market" key={m.id}>
              <h3 className="field-label">{m.label}</h3>
              <div className="selection-row" role="group" aria-label={m.label}>
                {m.selections.map((s) => {
                  const active =
                    armed?.marketId === m.id && armed.selectionId === s.id;
                  return (
                    <button
                      type="button"
                      key={s.id}
                      className={cn(
                        "selection-button",
                        active && "selection-button-active",
                      )}
                      aria-pressed={active}
                      onClick={() => arm(m.id, s.id)}
                    >
                      {/* s.label already carries the line for a total market
                          ("Over 2.5"), so no separate lineSuffix here. */}
                      <span>{s.label}</span>
                      <span>{s.price.toFixed(2)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {state.kind === "open" && market && selection && (
        <form className="side-form" onSubmit={submit}>
          <div className="data-pair">
            <span>{market.label}</span>
            <span>
              {selection.label} · {selection.price.toFixed(2)}
            </span>
          </div>

          {hasReaction && (
            <p className="fine-print">
              You&rsquo;re {reaction!.won}-{reaction!.lost} on {reaction!.label}
              .
            </p>
          )}

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
            onChange={(event) =>
              setStake(Number(event.target.value) || MIN_STAKE)
            }
            required
          />
          <div className="stake-chips">
            <button type="button" onClick={() => addStake(5)}>
              +5
            </button>
            <button type="button" onClick={() => addStake(25)}>
              +25
            </button>
            <button
              type="button"
              onClick={() => setStake(clampStake(MAX_STAKE, balance))}
            >
              max
            </button>
          </div>

          <span className="field-label">Place</span>
          {groups.length > 0 ? (
            <select
              id="wager-group"
              aria-label="Place"
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
          ) : (
            <p className="fine-print">
              Betting with friends?{" "}
              <Link href="/groups/new">Create a group</Link> and your picks show
              up on its board.
            </p>
          )}

          <div className="data-pair">
            <span>Returns</span>
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

          <Button
            type="submit"
            className="w-full"
            disabled={pending || insufficientCredits}
          >
            Place {stake} → returns {potentialReturn}
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
                {wager.settlement ? (
                  <StatusTag tone={outcomeTone(wager.settlement.outcome)}>
                    {settlementLabel(wager.settlement.outcome)}
                  </StatusTag>
                ) : (
                  <StatusTag tone="neutral">open</StatusTag>
                )}{" "}
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
