import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { z } from "zod";
import { BetsHistory } from "@/components/bets-history";
import { ResetBankroll } from "@/components/reset-bankroll";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusTag } from "@/components/ui/status-tag";
import { getCreditSummary } from "@/data/credits";
import {
  countOpenWagers,
  getRecordSlices,
  listWagerHistory,
} from "@/data/wagers-repository";
import { requireAccount, signOut } from "@/lib/auth";
import type { RecordSlice } from "@/lib/contracts";

export const dynamic = "force-dynamic";
// Client router cache, page-scoped. See src/app/games/[id]/page.tsx.
export const unstable_dynamicStaleTime = 300;
export const metadata: Metadata = { title: "You" };

const PAGE_SIZE = 20;

const sportSchema = z.enum(["all", "soccer", "baseball"]).catch("all");
const outcomeSchema = z
  .enum(["all", "won", "lost", "void", "open"])
  .catch("all");
const rangeSchema = z.enum(["all", "7d", "30d", "90d"]).catch("all");
const scopeSchema = z.enum(["all", "solo", "group"]).catch("all");
const pageSchema = z.coerce.number().int().min(1).catch(1);

const RANGE_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

function sinceFor(range: string): Date | undefined {
  const days = RANGE_DAYS[range];
  return days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : undefined;
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function buildHref(
  filters: { sport: string; outcome: string; range: string; scope: string },
  page: number,
) {
  const params = new URLSearchParams();
  if (filters.sport !== "all") params.set("sport", filters.sport);
  if (filters.outcome !== "all") params.set("outcome", filters.outcome);
  if (filters.range !== "all") params.set("range", filters.range);
  if (filters.scope !== "all") params.set("scope", filters.scope);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/you?${qs}` : "/you";
}

// Moved from account/page.tsx: the one surface that shows a hit rate now
// owns the one function that computes it.
function hitRateLabel(won: number, lost: number) {
  const decided = won + lost;
  return decided > 0 ? `${Math.round((won / decided) * 100)}%` : "Not provided";
}

function SliceRow({ slice }: { slice: RecordSlice }) {
  return (
    <div className="stat-row">
      <span>{slice.label}</span>
      <strong>
        {slice.won}-{slice.lost}
        {slice.voided ? `-${slice.voided}` : ""} ·{" "}
        {hitRateLabel(slice.won, slice.lost)}
      </strong>
    </div>
  );
}

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Page({ searchParams }: Props) {
  const account = await requireAccount();

  // Deviation from the plan's literal "requireAccount() -> redirect": Next's
  // redirect() from a full-document GET renders a client-side meta-refresh
  // rather than an HTTP 3xx here, which axe and a plain page.goto both read
  // as a mid-test navigation. /bets already established the fix for exactly
  // this "unconfigured" condition — an inline honest panel instead of a
  // redirect — and CLAUDE.md is explicit that a missing DATABASE_URL "must
  // not break builds or navigation." Only "unauthenticated" still redirects.
  if (!account.ok && account.reason === "unconfigured") {
    return (
      <>
        <header className="page-heading">
          <div>
            <p className="eyebrow">Free-to-play record</p>
            <h1 className="display-title">You</h1>
            <p className="page-description">
              Balance, record, open wagers, and history — one surface for where
              you stand.
            </p>
          </div>
        </header>
        <section className="panel" aria-labelledby="you-unavailable-heading">
          <div className="panel-header">
            <h2 className="panel-title" id="you-unavailable-heading">
              Sign-in unavailable
            </h2>
          </div>
          <div className="empty-state">
            <div>
              <span className="empty-icon">
                <AlertTriangle aria-hidden="true" />
              </span>
              <h3 className="empty-title">Sign-in is not configured</h3>
              <p className="empty-copy">
                This environment has no auth provider configured, so there is no
                wager record to show.
              </p>
            </div>
          </div>
        </section>
      </>
    );
  }
  if (!account.ok) redirect("/sign-in?callbackUrl=/you");

  const raw = await searchParams;
  const filters = {
    sport: sportSchema.parse(first(raw.sport)),
    outcome: outcomeSchema.parse(first(raw.outcome)),
    range: rangeSchema.parse(first(raw.range)),
    scope: scopeSchema.parse(first(raw.scope)),
  };
  const page = pageSchema.parse(first(raw.page));

  const [summary, openCount, openWagers, justSettled, slices, history] =
    await Promise.all([
      getCreditSummary(account.userId),
      countOpenWagers(account.userId),
      listWagerHistory(account.userId, {
        outcome: "open",
        limit: 5,
        offset: 0,
      }),
      listWagerHistory(account.userId, {
        outcome: "settled",
        limit: 5,
        offset: 0,
      }),
      getRecordSlices(account.userId),
      listWagerHistory(account.userId, {
        sport: filters.sport === "all" ? undefined : filters.sport,
        outcome: filters.outcome === "all" ? undefined : filters.outcome,
        since: sinceFor(filters.range),
        scope: filters.scope === "all" ? undefined : filters.scope,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
    ]);

  const filtersActive =
    filters.sport !== "all" ||
    filters.outcome !== "all" ||
    filters.range !== "all" ||
    filters.scope !== "all";
  const emptyState = filtersActive
    ? {
        title: "No wagers match these filters",
        copy: "Try a different sport, outcome, or time range.",
      }
    : {
        title: "No wagers yet",
        copy: "Place a free-to-play wager from a game page to see your history here.",
      };

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Free-to-play record</p>
          <h1 className="display-title">
            {account.name ?? account.email ?? "You"}
          </h1>
          <p className="page-description">
            Balance, record, open wagers, and history — one surface for where
            you stand. Fictional credits, house prices, never real money.
          </p>
        </div>
      </header>

      <div className="section-grid">
        <Card title="Standing" titleId="standing-heading">
          <div className="stat-row">
            <span>Balance</span>
            <strong>{summary.balance.toLocaleString()} credits</strong>
          </div>
          <div className="stat-row">
            <span>Record</span>
            <strong>
              {summary.won}W {summary.lost}L {summary.voided}V
            </strong>
          </div>
          <div className="stat-row">
            <span>Hit rate</span>
            <strong>{hitRateLabel(summary.won, summary.lost)}</strong>
          </div>
          <div className="stat-row">
            <span>Net</span>
            <strong>{summary.net.toLocaleString()} credits</strong>
          </div>
          <div className="form-block">
            <span>
              Times reset: {summary.resetCount.toLocaleString()} — a reset makes
              this record less meaningful.
            </span>
          </div>
        </Card>

        <Card
          title="Open wagers"
          titleId="open-wagers-heading"
          headerExtra={<StatusTag>{openCount} open</StatusTag>}
        >
          <BetsHistory
            items={openWagers.items}
            emptyState={{
              title: "No open wagers",
              copy: "Place a free-to-play wager from a game page to see it here.",
            }}
          />
        </Card>

        <Card title="Just settled" titleId="just-settled-heading">
          <BetsHistory
            items={justSettled.items}
            emptyState={{
              title: "Nothing settled yet",
              copy: "Settled wagers land here once a game finishes.",
            }}
          />
        </Card>

        <Card title="Slices" titleId="slices-heading">
          <p className="stat-group-label">By sport</p>
          {slices.bySport.length ? (
            slices.bySport.map((slice) => (
              <SliceRow slice={slice} key={slice.key} />
            ))
          ) : (
            <div className="panel-body">
              <p className="not-provided">
                No settled wagers yet. <Link href="/">Browse the board</Link>.
              </p>
            </div>
          )}
          <p className="stat-group-label">By market</p>
          {slices.byMarket.length ? (
            slices.byMarket.map((slice) => (
              <SliceRow slice={slice} key={slice.key} />
            ))
          ) : (
            <div className="panel-body">
              <p className="not-provided">
                No settled wagers yet. <Link href="/">Browse the board</Link>.
              </p>
            </div>
          )}
        </Card>
      </div>

      <section className="panel" aria-labelledby="you-history-heading">
        <div className="panel-header">
          <h2 className="panel-title" id="you-history-heading">
            History
          </h2>
          <span className="fine-print">Page {page}</span>
        </div>

        <form
          method="get"
          aria-label="Filter wager history"
          className="filter-bar"
        >
          <div>
            <label htmlFor="you-sport" className="field-label">
              Sport
            </label>
            <select
              id="you-sport"
              name="sport"
              className="control-select"
              defaultValue={filters.sport}
            >
              <option value="all">All sports</option>
              <option value="soccer">Soccer</option>
              <option value="baseball">Baseball</option>
            </select>
          </div>
          <div>
            <label htmlFor="you-outcome" className="field-label">
              Outcome
            </label>
            <select
              id="you-outcome"
              name="outcome"
              className="control-select"
              defaultValue={filters.outcome}
            >
              <option value="all">All outcomes</option>
              <option value="open">Open</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
              <option value="void">Void</option>
            </select>
          </div>
          <div>
            <label htmlFor="you-range" className="field-label">
              Time range
            </label>
            <select
              id="you-range"
              name="range"
              className="control-select"
              defaultValue={filters.range}
            >
              <option value="all">All time</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
          </div>
          <div>
            <label htmlFor="you-scope" className="field-label">
              Placed
            </label>
            <select
              id="you-scope"
              name="scope"
              className="control-select"
              defaultValue={filters.scope}
            >
              <option value="all">Solo and group</option>
              <option value="solo">Solo only</option>
              <option value="group">Group only</option>
            </select>
          </div>
          <Button type="submit" size="sm">
            Apply filters
          </Button>
        </form>

        <BetsHistory items={history.items} emptyState={emptyState} />

        <div className="panel-body flex items-center justify-between">
          {page > 1 ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={buildHref(filters, page - 1)}>Prev</Link>
            </Button>
          ) : (
            <Button variant="secondary" size="sm" disabled>
              Prev
            </Button>
          )}
          {history.hasMore ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={buildHref(filters, page + 1)}>Next</Link>
            </Button>
          ) : (
            <Button variant="secondary" size="sm" disabled>
              Next
            </Button>
          )}
        </div>
      </section>

      <section className="panel" aria-labelledby="you-settings-heading">
        <div className="panel-header">
          <h2 className="panel-title" id="you-settings-heading">
            Settings
          </h2>
        </div>
        <div className="panel-body flex flex-wrap items-center gap-3">
          <span className="fine-print">
            Reset your bankroll back to the starting balance.
          </span>
          <ResetBankroll />
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <Button type="submit" variant="secondary" size="sm">
              Sign out
            </Button>
          </form>
        </div>
        <div className="form-block">
          <span>
            Read the <Link href="/rules">simulator rules</Link> before you place
            a wager.
          </span>
        </div>
      </section>
    </>
  );
}
