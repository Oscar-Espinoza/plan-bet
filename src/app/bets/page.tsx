import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { z } from "zod";
import { BetsHistory } from "@/components/bets-history";
import { Button } from "@/components/ui/button";
import { listWagerHistory } from "@/data/wagers-repository";
import { requireAccount } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bets" };

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
  return qs ? `/bets?${qs}` : "/bets";
}

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Page({ searchParams }: Props) {
  const account = await requireAccount();

  if (!account.ok && account.reason === "unconfigured") {
    return (
      <>
        <header className="page-heading">
          <div>
            <p className="eyebrow">Free-to-play record</p>
            <h1 className="display-title">Bets</h1>
            <p className="page-description">
              Your wager history — settled and open — for the free-to-play
              simulator.
            </p>
          </div>
        </header>
        <section className="panel" aria-labelledby="bets-unavailable-heading">
          <div className="panel-header">
            <h2 className="panel-title" id="bets-unavailable-heading">
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
                wager history to show.
              </p>
            </div>
          </div>
        </section>
      </>
    );
  }
  if (!account.ok) redirect("/sign-in?callbackUrl=/bets");

  const raw = await searchParams;
  const filters = {
    sport: sportSchema.parse(first(raw.sport)),
    outcome: outcomeSchema.parse(first(raw.outcome)),
    range: rangeSchema.parse(first(raw.range)),
    scope: scopeSchema.parse(first(raw.scope)),
  };
  const page = pageSchema.parse(first(raw.page));

  const { items, hasMore } = await listWagerHistory(account.userId, {
    sport: filters.sport === "all" ? undefined : filters.sport,
    outcome: filters.outcome === "all" ? undefined : filters.outcome,
    since: sinceFor(filters.range),
    scope: filters.scope === "all" ? undefined : filters.scope,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

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
          <h1 className="display-title">Bets</h1>
          <p className="page-description">
            Your wager history — settled and open — for the free-to-play
            simulator. Fictional credits, house prices, never real money.
          </p>
        </div>
      </header>

      <section className="panel" aria-labelledby="bets-filters-heading">
        <div className="panel-header">
          <h2 className="panel-title" id="bets-filters-heading">
            Filters
          </h2>
        </div>
        <div className="panel-body">
          <form
            method="get"
            aria-label="Filter wager history"
            className="flex flex-wrap items-end gap-3"
          >
            <div>
              <label htmlFor="bets-sport" className="field-label">
                Sport
              </label>
              <select
                id="bets-sport"
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
              <label htmlFor="bets-outcome" className="field-label">
                Outcome
              </label>
              <select
                id="bets-outcome"
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
              <label htmlFor="bets-range" className="field-label">
                Time range
              </label>
              <select
                id="bets-range"
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
              <label htmlFor="bets-scope" className="field-label">
                Placed
              </label>
              <select
                id="bets-scope"
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
        </div>
      </section>

      <section className="panel" aria-labelledby="bets-history-heading">
        <div className="panel-header">
          <h2 className="panel-title" id="bets-history-heading">
            History
          </h2>
          <span className="fine-print">Page {page}</span>
        </div>

        <BetsHistory items={items} emptyState={emptyState} />

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
          {hasMore ? (
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
    </>
  );
}
