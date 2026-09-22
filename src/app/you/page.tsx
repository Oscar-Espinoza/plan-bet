import { Suspense, type ReactNode } from "react";
import { getTranslation } from "@/lib/locale-server";
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
export const unstable_dynamicStaleTime = 30;
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslation();
  return { title: t("You") };
}

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

async function SliceRow({ slice }: { slice: RecordSlice }) {
  const { t } = await getTranslation();
  return (
    <div className="stat-row">
      <span>{t(slice.label)}</span>
      <strong>
        {slice.won}-{slice.lost}
        {slice.voided ? `-${slice.voided}` : ""} ·{" "}
        {t(hitRateLabel(slice.won, slice.lost))}
      </strong>
    </div>
  );
}

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Page({ searchParams }: Props) {
  const { formatNumber, t } = await getTranslation();
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
            <p className="eyebrow">{t("Free-to-play record")}</p>
            <h1 className="display-title">{t("Where you stand")}</h1>
            <p className="page-description">
              {t(
                "Balance, record, open wagers, and history — one surface for where you stand.",
              )}{" "}
            </p>
          </div>
        </header>
        <section className="panel" aria-labelledby="you-unavailable-heading">
          <div className="panel-header">
            <h2 className="panel-title" id="you-unavailable-heading">
              {t("Sign-in unavailable")}{" "}
            </h2>
          </div>
          <div className="empty-state">
            <div>
              <span className="empty-icon">
                <AlertTriangle aria-hidden="true" />
              </span>
              <h3 className="empty-title">{t("Sign-in is not configured")}</h3>
              <p className="empty-copy">
                {t(
                  "This environment has no auth provider configured, so there is no wager record to show.",
                )}{" "}
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

  const summaryPromise = getCreditSummary(account.userId);
  const openPromise = Promise.all([
    countOpenWagers(account.userId),
    listWagerHistory(account.userId, { outcome: "open", limit: 5, offset: 0 }),
  ]);
  const settledPromise = listWagerHistory(account.userId, {
    outcome: "settled",
    limit: 5,
    offset: 0,
  });
  const slicesPromise = getRecordSlices(account.userId);
  const historyPromise = listWagerHistory(account.userId, {
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
          <p className="eyebrow">
            {account.name ?? account.email ?? t("Free-to-play record")}
          </p>
          <h1 className="display-title">{t("Where you stand")}</h1>
          <Suspense fallback={<p role="status">{t("Loading…")}</p>}>
            <Resolved promise={summaryPromise}>
              {(summary) => (
                <>
                  {" "}
                  <div className="standing-lead">
                    <div>
                      <p className="eyebrow">{t("Balance")}</p>
                      <p className="standing-figure">
                        {formatNumber(summary.balance)}{" "}
                        <small>{t("credits")}</small>
                      </p>
                    </div>
                    <div>
                      <p className="eyebrow">{t("Record")}</p>
                      <p className="standing-figure standing-figure-minor">
                        {summary.won}
                        {t("W")} {summary.lost}
                        {t("L")} {summary.voided}
                        {t("V")}{" "}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </Resolved>
          </Suspense>
          <p className="page-description">
            {t("Fictional credits, house prices, never real money.")}{" "}
          </p>
        </div>
      </header>

      <div className="section-grid">
        <Suspense fallback={<p role="status">{t("Loading…")}</p>}>
          <Resolved promise={openPromise}>
            {([openCount, openWagers]) => (
              <Card
                title={t("Open wagers")}
                titleId="open-wagers-heading"
                headerExtra={
                  <StatusTag>
                    {openCount} {t("open")}
                  </StatusTag>
                }
              >
                <BetsHistory
                  items={openWagers.items}
                  emptyState={{
                    title: "No open wagers",
                    copy: "Place a free-to-play wager from a game page to see it here.",
                  }}
                />
              </Card>
            )}
          </Resolved>
        </Suspense>

        <Suspense fallback={<p role="status">{t("Loading…")}</p>}>
          <Resolved promise={settledPromise}>
            {(justSettled) => (
              <Card title={t("Just settled")} titleId="just-settled-heading">
                <BetsHistory
                  items={justSettled.items}
                  emptyState={{
                    title: "Nothing settled yet",
                    copy: "Settled wagers land here once a game finishes.",
                  }}
                />
              </Card>
            )}
          </Resolved>
        </Suspense>

        <Suspense fallback={<p role="status">{t("Loading…")}</p>}>
          <Resolved promise={slicesPromise}>
            {(slices) => (
              <Card title={t("Slices")} titleId="slices-heading">
                <p className="stat-group-label">{t("By sport")}</p>
                {slices.bySport.length ? (
                  slices.bySport.map((slice) => (
                    <SliceRow slice={slice} key={slice.key} />
                  ))
                ) : (
                  <div className="panel-body">
                    <p className="not-provided">
                      {t("No settled wagers yet.")}{" "}
                      <Link href="/">{t("Browse the board")}</Link>.
                    </p>
                  </div>
                )}
                <p className="stat-group-label">{t("By market")}</p>
                {slices.byMarket.length ? (
                  slices.byMarket.map((slice) => (
                    <SliceRow slice={slice} key={slice.key} />
                  ))
                ) : (
                  <div className="panel-body">
                    <p className="not-provided">
                      {t("No settled wagers yet.")}{" "}
                      <Link href="/">{t("Browse the board")}</Link>.
                    </p>
                  </div>
                )}
              </Card>
            )}
          </Resolved>
        </Suspense>

        <Suspense fallback={<p role="status">{t("Loading…")}</p>}>
          <Resolved promise={summaryPromise}>
            {(summary) => (
              <Card title={t("Detail")} titleId="detail-heading">
                <div className="stat-row">
                  <span>{t("Hit rate")}</span>
                  <strong>{t(hitRateLabel(summary.won, summary.lost))}</strong>
                </div>
                <div className="stat-row">
                  <span>{t("Net")}</span>
                  <strong>
                    {formatNumber(summary.net)} {t("credits")}
                  </strong>
                </div>
                <div className="form-block">
                  <span>
                    {t("Times reset:")} {formatNumber(summary.resetCount)}{" "}
                    {t("— a reset makes this record less meaningful.")}{" "}
                  </span>
                </div>
              </Card>
            )}
          </Resolved>
        </Suspense>
      </div>

      <Suspense fallback={<p role="status">{t("Loading…")}</p>}>
        <Resolved promise={historyPromise}>
          {(history) => (
            <section className="panel" aria-labelledby="you-history-heading">
              <div className="panel-header">
                <h2 className="panel-title" id="you-history-heading">
                  {t("History")}{" "}
                </h2>
                <span className="fine-print">
                  {t("Page")} {page}
                </span>
              </div>

              <form
                method="get"
                aria-label={t("Filter wager history")}
                className="filter-bar"
              >
                <div>
                  <label htmlFor="you-sport" className="field-label">
                    {t("Sport")}{" "}
                  </label>
                  <select
                    id="you-sport"
                    name="sport"
                    className="control-select"
                    defaultValue={filters.sport}
                  >
                    <option value="all">{t("All sports")}</option>
                    <option value="soccer">{t("Soccer")}</option>
                    <option value="baseball">{t("Baseball")}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="you-outcome" className="field-label">
                    {t("Outcome")}{" "}
                  </label>
                  <select
                    id="you-outcome"
                    name="outcome"
                    className="control-select"
                    defaultValue={filters.outcome}
                  >
                    <option value="all">{t("All outcomes")}</option>
                    <option value="open">{t("Open")}</option>
                    <option value="won">{t("Won")}</option>
                    <option value="lost">{t("Lost")}</option>
                    <option value="void">{t("Void")}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="you-range" className="field-label">
                    {t("Time range")}{" "}
                  </label>
                  <select
                    id="you-range"
                    name="range"
                    className="control-select"
                    defaultValue={filters.range}
                  >
                    <option value="all">{t("All time")}</option>
                    <option value="7d">{t("Last 7 days")}</option>
                    <option value="30d">{t("Last 30 days")}</option>
                    <option value="90d">{t("Last 90 days")}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="you-scope" className="field-label">
                    {t("Placed")}{" "}
                  </label>
                  <select
                    id="you-scope"
                    name="scope"
                    className="control-select"
                    defaultValue={filters.scope}
                  >
                    <option value="all">{t("Solo and group")}</option>
                    <option value="solo">{t("Solo only")}</option>
                    <option value="group">{t("Group only")}</option>
                  </select>
                </div>
                <Button type="submit" size="sm">
                  {t("Apply filters")}{" "}
                </Button>
              </form>

              <BetsHistory items={history.items} emptyState={emptyState} />

              <div className="panel-body flex items-center justify-between">
                {page > 1 ? (
                  <Button asChild variant="secondary" size="sm">
                    <Link href={buildHref(filters, page - 1)}>{t("Prev")}</Link>
                  </Button>
                ) : (
                  <Button variant="secondary" size="sm" disabled>
                    {t("Prev")}{" "}
                  </Button>
                )}
                {history.hasMore ? (
                  <Button asChild variant="secondary" size="sm">
                    <Link href={buildHref(filters, page + 1)}>{t("Next")}</Link>
                  </Button>
                ) : (
                  <Button variant="secondary" size="sm" disabled>
                    {t("Next")}{" "}
                  </Button>
                )}
              </div>
            </section>
          )}
        </Resolved>
      </Suspense>

      <section className="panel" aria-labelledby="you-settings-heading">
        <div className="panel-header">
          <h2 className="panel-title" id="you-settings-heading">
            {t("Settings")}{" "}
          </h2>
        </div>
        <div className="panel-body flex flex-wrap items-center gap-3">
          <span className="fine-print">
            {t("Reset your bankroll back to the starting balance.")}{" "}
          </span>
          <ResetBankroll />
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <Button type="submit" variant="secondary" size="sm">
              {t("Sign out")}{" "}
            </Button>
          </form>
        </div>
        <div className="form-block">
          <span>
            {t("Read the")} <Link href="/rules">{t("simulator rules")}</Link>{" "}
            {t("before you place a wager.")}{" "}
          </span>
        </div>
      </section>
    </>
  );
}

async function Resolved<T>({
  promise,
  children,
}: {
  promise: Promise<T>;
  children: (value: T) => ReactNode;
}) {
  return children(await promise);
}
