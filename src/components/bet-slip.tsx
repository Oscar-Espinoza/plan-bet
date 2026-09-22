"use client";
import { useTranslation } from "@/components/language-provider";

import { useId, useState } from "react";
import Link from "next/link";
import { Ticket } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { ActionPortal } from "@/components/action-bar";
import { type CommentThreadView } from "@/components/game-thread";
import { LocalDateTime } from "@/components/local-date-time";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { StatusTag } from "@/components/ui/status-tag";
import {
  wagerPlacementResultSchema,
  type RecordSlice,
  type Wager,
} from "@/lib/contracts";
import {
  MIN_STAKE,
  wagerSelectionLabel,
  inMarketCategory,
  namedSelection,
  type Market,
  type MarketCategory,
} from "@/lib/markets";
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
    };

export type WagerPanelData =
  | { signedIn: false; routeId: string }
  | {
      signedIn: true;
      routeId: string;
      state: WagerPanelState;
      wagers: Wager[];
      // Other members' picks on this game, across every group the viewer
      // belongs to, and this game's comment threads — both render in every
      // panel state, not just "open".
      groupPicks: {
        wager: Wager;
        userName: string | null;
        groupName: string;
      }[];
      threads: CommentThreadView[];
    };

type ArmedSelection = { marketId: string; selectionId: string };

/** The only ceiling is the balance; MAX_STAKE is a column bound, not a rule. */
function clampStake(value: number, balance: number) {
  return Math.min(balance, Math.max(MIN_STAKE, value));
}

/**
 * Exact score, typed rather than hunted for.
 *
 * The market still publishes the same sixteen selections at the same prices —
 * this only changes how one of them is chosen. Two figures compose the
 * selection id the server already knows (`"2-1"`), so nothing about pricing,
 * placement or settlement moves. A scoreline outside the published grid
 * resolves to no selection, which is exactly what leaves the form disabled.
 */
function ScoreEntry({
  market,
  home,
  away,
  armedId,
  onArm,
}: {
  market: Market;
  home: string;
  away: string;
  armedId?: string;
  onArm: (selectionId?: string) => void;
}) {
  const { formatNumber, t } = useTranslation();
  const [score, setScore] = useState(() => {
    const [h, a] = armedId?.split("-") ?? [];
    return { home: h ?? "", away: a ?? "" };
  });

  const change = (side: "home" | "away", raw: string) => {
    const next = { ...score, [side]: raw.replace(/[^0-9]/g, "").slice(0, 1) };
    setScore(next);
    const id = `${next.home}-${next.away}`;
    onArm(
      next.home && next.away && market.selections.some((s) => s.id === id)
        ? id
        : undefined,
    );
  };

  const priced = market.selections.find(
    (s) => s.id === `${score.home}-${score.away}`,
  );
  const complete = score.home !== "" && score.away !== "";

  return (
    <div className="mp-score">
      <label className="mp-score-team">
        <span>{home}</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={3}
          step={1}
          placeholder="0"
          aria-label={t("{p0} goals", { p0: home })}
          value={score.home}
          onChange={(event) => change("home", event.target.value)}
        />
      </label>
      <span className="mp-score-dash" aria-hidden="true">
        &ndash;
      </span>
      <label className="mp-score-team">
        <span>{away}</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={3}
          step={1}
          placeholder="0"
          aria-label={t("{p0} goals", { p0: away })}
          value={score.away}
          onChange={(event) => change("away", event.target.value)}
        />
      </label>
      <p className="mp-score-price" data-unpriced={priced ? undefined : ""}>
        {priced
          ? t("Pays {p0}", { p0: formatNumber(priced.price, 2) })
          : complete
            ? t("Not priced — 0-0 through 3-3 only")
            : t("Type a score")}
      </p>
    </div>
  );
}

export function BetSlip({
  data,
  matchup,
  matchFinished = false,
}: {
  data: WagerPanelData;
  matchFinished?: boolean;
  // Names for the exact-score entry. Absent in the unit tests, which render
  // the slip on its own.
  matchup?: { home: string; away: string };
}) {
  const { formatNumber, t } = useTranslation();
  const router = useRouter();
  const formId = useId();
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
  const groupPicks = data.signedIn ? data.groupPicks : [];

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
  const [category, setCategory] = useState<MarketCategory>(
    () => market?.category ?? "popular",
  );
  const marketHeading = (m: Market) =>
    m.team
      ? `${matchup?.[m.team] ?? t(m.team === "home" ? "Home" : "Away")} · ${t(m.label)}`
      : t(m.label);
  const selection = market?.selections.find((s) => s.id === armed?.selectionId);
  const reaction = byMarket.find((slice) => slice.key === market?.id);
  const hasReaction =
    reaction && reaction.won + reaction.lost + reaction.voided > 0;

  // Held as text so an empty field is a legal intermediate state. Storing a
  // number here meant `Number("") || MIN_STAKE` snapped the input back to 1
  // the instant you cleared it, so a custom amount could only ever be appended
  // to whatever was already there.
  const [stakeText, setStakeText] = useState(String(MIN_STAKE));
  const stake = Number.parseInt(stakeText, 10) || 0;
  const [groupId, setGroupId] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const potentialReturn = selection ? Math.round(stake * selection.price) : 0;
  const balanceAfter = balance - stake;
  const insufficientCredits = stake > balance;
  const stakeEntered = stake >= MIN_STAKE;

  const arm = (marketId: string, selectionId: string) => {
    setArmed({ marketId, selectionId });
    setConfirmation("");
    setError("");
  };

  const addStake = (amount: number) =>
    setStakeText(String(clampStake(stake + amount, balance)));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!market || !selection || pending || insufficientCredits) return;
    if (!stakeEntered) return;
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
    const payload: unknown = await response?.json().catch(() => null);
    setPending(false);
    if (!response?.ok) {
      const text =
        payload && typeof payload === "object" && "error" in payload
          ? String(
              (payload as { error: { message?: string } }).error?.message ?? "",
            )
          : "";
      setError(text || "The bet did not go through. Try again.");
      return;
    }

    const result = wagerPlacementResultSchema.parse(
      (payload as { data: unknown }).data,
    );
    setConfirmation(
      t("Placed {p0} on {p1} → returns {p2}. New balance: {p3}.", {
        p0: result.wager.stake,
        p1: t(wagerSelectionLabel(result.wager)),
        p2: result.wager.potentialReturn,
        p3: result.summary.balance,
      }),
    );
    setArmed(undefined);
    setStakeText(String(MIN_STAKE));
    setGroupId("");
    advanceTour(2);
    router.refresh();
  };

  if (!data.signedIn) {
    return (
      <section className="panel wager-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">
              <span>{t(matchFinished ? "Match finished" : "Make a bet")}</span>
            </h2>
            <p className="panel-purpose">
              {t("Simulate a bet on this match with fictional credits.")}{" "}
            </p>
          </div>
        </div>
        <div className="side-form">
          <ActionPortal area="action">
            <Button asChild className="w-full">
              <Link href={`/sign-in?callbackUrl=/games/${data.routeId}`}>
                {t("Sign in")}{" "}
              </Link>
            </Button>
          </ActionPortal>
          <p className="fine-print">
            {t(
              "Signing in only unlocks the credit ledger — the rest of the page works signed out.",
            )}{" "}
          </p>
        </div>
      </section>
    );
  }

  const { state, wagers } = data;

  return (
    <section className="panel wager-panel" aria-labelledby="wager-heading">
      <div className="panel-header">
        <div>
          <h2 className="panel-title" id="wager-heading">
            {state.kind === "open" && (
              <Ticket aria-hidden="true" className="bet-ticket-icon" />
            )}
            <span>
              {t(
                state.kind === "open"
                  ? "Make a bet"
                  : state.kind === "closed" && state.reason === "finished"
                    ? "Your match results"
                    : "Betting closed",
              )}
            </span>
          </h2>
          <p className="panel-purpose">
            {state.kind === "open"
              ? t("Simulate a bet on this match with fictional credits.")
              : t("Your bets and returns for this match.")}
          </p>
        </div>
        {/* The balance used to appear only after a selection was armed, so the
            one number you need before choosing a stake was the one number the
            panel hid. Ink on concrete: money stays quiet. */}
        {state.kind === "open" && (
          <span className="bet-balance">
            <small>{t("Balance")}</small>
            {formatNumber(state.balance)}
          </span>
        )}
      </div>

      {state.kind === "unavailable" && (
        <p className="side-form">{t("This game is not open for bets.")}</p>
      )}
      {state.kind === "closed" && (
        <p className="side-form">{t(CLOSED_COPY[state.reason])}</p>
      )}

      <ActionPortal area="feedback">
        <div className="wager-feedback" aria-live="polite" aria-atomic="true">
          {confirmation && (
            <div className="enter-pop">
              <Banner tone="positive" role="status">
                {t(confirmation)}
              </Banner>
            </div>
          )}
          {error && (
            <Banner tone="negative" role="alert">
              {t(error)}
            </Banner>
          )}
          {state.kind === "open" && insufficientCredits && selection && (
            <Banner tone="negative" role="alert">
              {t("Stake exceeds your balance of")} {balance}.
            </Banner>
          )}
        </div>
      </ActionPortal>
      {state.kind === "open" && (
        <>
          <ActionPortal area="returns">
            <span className="action-bar-label">{t("Returns")}</span>
            <span className="return-figure">
              {selection ? potentialReturn : "—"}
            </span>
          </ActionPortal>
          <ActionPortal area="action">
            {/* The stake rides in the bar beside the button it feeds. It stays
                associated with the form in the panel by id, so native
                validation and Enter-to-submit are unchanged by the move. */}
            {selection && (
              <div className="action-bar-stake">
                <label className="action-bar-label" htmlFor="wager-stake">
                  {t("Stake")}{" "}
                </label>
                <input
                  id="wager-stake"
                  form={formId}
                  className="field"
                  type="number"
                  inputMode="numeric"
                  min={MIN_STAKE}
                  // Native validity agrees with the app-level check rather
                  // than with a published cap: the balance is the limit.
                  max={balance}
                  step={1}
                  value={stakeText}
                  onChange={(event) => setStakeText(event.target.value)}
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
                    onClick={() =>
                      setStakeText(String(clampStake(balance, balance)))
                    }
                  >
                    {t("max")}{" "}
                  </button>
                </div>
              </div>
            )}
            <Button
              type="submit"
              form={formId}
              className="w-full"
              disabled={
                !selection || pending || insufficientCredits || !stakeEntered
              }
            >
              {pending
                ? t("Placing…")
                : !selection
                  ? t("Choose a selection")
                  : stakeEntered
                    ? t("Place {p0} credits", { p0: stake })
                    : t("Enter a stake")}
            </Button>
          </ActionPortal>
        </>
      )}

      {state.kind === "open" && (
        <div className="selection-grid">
          <div
            className="market-filters"
            role="group"
            aria-label={t("Bet categories")}
          >
            {(["popular", "totals", "teams"] as const).map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={category === value}
                onClick={() => setCategory(value)}
              >
                {t(
                  value === "popular"
                    ? "Popular"
                    : value === "teams"
                      ? "Teams"
                      : openMarkets.some((m) => m.id.startsWith("soccer-"))
                        ? "Goals"
                        : "Runs",
                )}
              </button>
            ))}
          </div>
          {market && selection && (
            <div className="bet-selected-summary" role="status">
              <span>{t("Your selection")}</span>
              <strong>{marketHeading(market)}</strong>
              <span>{t(namedSelection(market, selection, matchup))}</span>
              <b>{formatNumber(selection.price, 2)}×</b>
            </div>
          )}
          {openMarkets.map((m) => (
            <div
              className="selection-market"
              key={m.id}
              hidden={!inMarketCategory(m, category)}
            >
              <h3 className="field-label">{marketHeading(m)}</h3>
              {m.kind === "exact_score" ? (
                <ScoreEntry
                  market={m}
                  home={matchup?.home ?? "Home"}
                  away={matchup?.away ?? "Away"}
                  armedId={
                    armed?.marketId === m.id ? armed.selectionId : undefined
                  }
                  onArm={(selectionId) =>
                    selectionId ? arm(m.id, selectionId) : setArmed(undefined)
                  }
                />
              ) : (
                <div
                  className="selection-row"
                  role="group"
                  aria-label={marketHeading(m)}
                >
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
                        <span>
                          {t(m.team ? s.label : namedSelection(m, s, matchup))}
                        </span>
                        <span>{formatNumber(s.price, 2)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          {!selection && (
            <p className="bet-hint">
              {t(
                "Nothing picked yet — tap any price above to set a stake.",
              )}{" "}
            </p>
          )}
        </div>
      )}

      {state.kind === "open" && market && selection && (
        <form id={formId} className="side-form enter" onSubmit={submit}>
          {hasReaction && (
            <p className="fine-print">
              {t("You’re")} {reaction!.won}-{reaction!.lost} {t("on")}{" "}
              {t(reaction!.label)}.
            </p>
          )}

          <span className="field-label">{t("Place")}</span>
          {groups.length > 0 ? (
            <select
              id="wager-group"
              aria-label={t("Place")}
              className="field"
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
            >
              <option value="">{t("Alone")}</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {t("With")} {group.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="fine-print">
              {t("Betting with friends?")}{" "}
              <Link href="/groups/new">{t("Create a group")}</Link>{" "}
              {t("and your picks show up on its board.")}{" "}
            </p>
          )}

          <div className="data-pair">
            <span>{t("Balance after")}</span>
            <span>{balanceAfter}</span>
          </div>

          <p className="fine-print">
            {t("Fictional credits, house prices. See the")}{" "}
            <Link href="/rules">{t("rules")}</Link>.
          </p>
        </form>
      )}

      {wagers.length > 0 && (
        <div className="side-form">
          <h3 className="field-label">{t("Your bets on this game")}</h3>
          {wagers.map((wager) => (
            <div className="personal-wager" key={wager.id}>
              <div className="personal-wager-heading">
                <strong>
                  {matchup && ["home", "away"].includes(wager.selectionId)
                    ? matchup[wager.selectionId as "home" | "away"]
                    : t(wager.selectionLabel)}
                </strong>
                <StatusTag
                  tone={
                    wager.settlement
                      ? outcomeTone(wager.settlement.outcome)
                      : "neutral"
                  }
                >
                  {t(
                    wager.settlement
                      ? settlementLabel(wager.settlement.outcome)
                      : "open",
                  )}
                </StatusTag>
              </div>
              <dl>
                <div>
                  <dt>{t("Odds")}</dt>
                  <dd>{formatNumber(wager.price, 2)}</dd>
                </div>
                <div>
                  <dt>{t("Stake")}</dt>
                  <dd>{formatNumber(wager.stake)}</dd>
                </div>
                <div>
                  <dt>
                    {t(wager.settlement ? "Returned" : "Potential return")}
                  </dt>
                  <dd>
                    {formatNumber(
                      wager.settlement?.returned ?? wager.potentialReturn,
                    )}
                  </dd>
                </div>
              </dl>
              <LocalDateTime value={wager.placedAt} short />
            </div>
          ))}
        </div>
      )}

      {groupPicks.length > 0 && (
        <details className="mp-aside">
          <summary>{t("Group picks on this game")}</summary>
          <div className="side-form">
            {groupPicks.map((pick) => (
              <p className="fine-print" key={pick.wager.id}>
                {pick.groupName} — {pick.userName ?? t("A member")}:{" "}
                {pick.wager.stake} · {t(wagerSelectionLabel(pick.wager))}
              </p>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
