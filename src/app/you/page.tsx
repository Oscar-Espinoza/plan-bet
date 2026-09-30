import { Suspense, type ReactNode } from "react";
import { Breadcrumb } from "@/components/breadcrumb";
import { getTranslation } from "@/lib/locale-server";
import type { Metadata } from "next";
import { NavigationLink as Link } from "@/components/fast-link";
import { redirect } from "next/navigation";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { SectionTabs } from "@/components/section-tabs";
import { z } from "zod";
import { BetsHistory } from "@/components/bets-history";
import { LanguageSwitch } from "@/components/language-provider";
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
  const params = new URLSearchParams({ tab: "bets" });
  if (filters.sport !== "all") params.set("sport", filters.sport);
  if (filters.outcome !== "all") params.set("outcome", filters.outcome);
  if (filters.range !== "all") params.set("range", filters.range);
  if (filters.scope !== "all") params.set("scope", filters.scope);
  if (page > 1) params.set("page", String(page));
  return `/you?${params.toString()}`;
}

const tabSchema = z.enum(["overview", "bets", "settings"]).catch("overview");

// Moved from account/page.tsx: the one surface that shows a hit rate now
// owns the one function that computes it.
function hitRateLabel(won: number, lost: number) {
  const decided = won + lost;
  return decided > 0 ? `${Math.round((won / decided) * 100)}%` : "Not provided";
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
  // redirect — and AGENTS.md is explicit that a missing DATABASE_URL "must
  // not break builds or navigation." Only "unauthenticated" still redirects.
  if (!account.ok && account.reason === "unconfigured") {
    return (
      <>
        <header className="page-heading">
          <Breadcrumb items={[{ label: t("You") }]} />
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
  const tab = tabSchema.parse(first(raw.tab));
  const summaryPromise = getCreditSummary(account.userId);

  return (
    <>
      <header className="page-heading">
        <Breadcrumb items={[{ label: t("You") }]} />
        <div>
          <p className="eyebrow">
            {account.name ?? account.email ?? t("Free-to-play record")}
          </p>
          <h1 className="display-title">{t("Where you stand")}</h1>
          {/* The balance and record head every tab: they are what the page
              is for, and the tabs below only change what sits under them. */}
          <Suspense
            fallback={
              <div
                className="standing-lead standing-lead-loading"
                role="status"
                aria-label={t("Loading…")}
              />
            }
          >
            <Resolved promise={summaryPromise}>
              {(summary) => (
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
                      {t("V")}
                    </p>
                  </div>
                  <div>
                    <p className="eyebrow">{t("Accuracy")}</p>
                    <p className="standing-figure standing-figure-minor">
                      {t(hitRateLabel(summary.won, summary.lost))}
                    </p>
                  </div>
                  <div>
                    <p className="eyebrow">{t("Net")}</p>
                    <p
                      className="standing-figure standing-figure-minor"
                      data-tone={
                        summary.net > 0
                          ? "up"
                          : summary.net < 0
                            ? "down"
                            : undefined
                      }
                    >
                      {summary.net > 0 ? "+" : ""}
                      {formatNumber(summary.net)}
                    </p>
                  </div>
                </div>
              )}
            </Resolved>
          </Suspense>
          <p className="page-description">
            {t("Fictional credits, house prices, never real money.")}{" "}
          </p>
        </div>
      </header>

      {/* All three panels render with the page, so switching tabs is
          instant; ?tab= only picks which one opens first. */}
      <SectionTabs
        label="Account sections"
        initial={tab}
        panels={[
          {
            key: "overview",
            label: "Overview",
            content: <Overview userId={account.userId} />,
          },
          {
            key: "bets",
            label: "Wagers",
            content: <Wagers userId={account.userId} raw={raw} />,
          },
          {
            key: "settings",
            label: "Settings",
            content: (
              <Preferences
                email={account.email}
                resetCount={summaryPromise.then(
                  (summary) => summary.resetCount,
                )}
              />
            ),
          },
        ]}
      />
    </>
  );
}

/** Open wagers first, then the last few settled, then where the record comes from. */
async function Overview({ userId }: { userId: string }) {
  const { t } = await getTranslation();
  const openPromise = Promise.all([
    countOpenWagers(userId),
    listWagerHistory(userId, { outcome: "open", limit: 5, offset: 0 }),
  ]);
  const settledPromise = listWagerHistory(userId, {
    outcome: "settled",
    limit: 3,
    offset: 0,
  });
  const slicesPromise = getRecordSlices(userId);
  return (
    <div className="section-grid">
      <Suspense fallback={<CardLoading label={t("Loading…")} />}>
        <Resolved promise={openPromise}>
          {([openCount, openWagers]) => (
            <Card
              title={t("Open wagers")}
              titleId="open-wagers-heading"
              headerExtra={
                openCount > 5 ? (
                  <Link className="card-link" href="/you?tab=bets&outcome=open">
                    {t("See all")} ({openCount})
                    <ChevronRight aria-hidden="true" size={16} />
                  </Link>
                ) : (
                  <StatusTag>
                    {openCount} {t("open")}
                  </StatusTag>
                )
              }
            >
              <BetsHistory
                compact
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

      <Suspense fallback={<CardLoading label={t("Loading…")} />}>
        <Resolved promise={settledPromise}>
          {(justSettled) => (
            <Card
              title={t("Just settled")}
              titleId="just-settled-heading"
              headerExtra={
                <Link className="card-link" href="/you?tab=bets">
                  {t("History")}
                  <ChevronRight aria-hidden="true" size={16} />
                </Link>
              }
            >
              <BetsHistory
                compact
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

      <Suspense fallback={<CardLoading label={t("Loading…")} />}>
        <Resolved promise={slicesPromise}>
          {(slices) => (
            <Card title={t("Slices")} titleId="slices-heading">
              {slices.bySport.length || slices.byMarket.length ? (
                <table className="slice-table">
                  <thead>
                    <tr>
                      <th scope="col" className="sr-only">
                        {t("Slice")}
                      </th>
                      <th scope="col">{t("W")}</th>
                      <th scope="col">{t("L")}</th>
                      <th scope="col">{t("V")}</th>
                      <th scope="col" aria-label={t("Hit rate")}>
                        %
                      </th>
                    </tr>
                  </thead>
                  {(
                    [
                      ["By sport", slices.bySport],
                      ["By market", slices.byMarket],
                    ] as const
                  ).map(
                    ([label, rows]) =>
                      rows.length > 0 && (
                        <tbody key={label}>
                          <tr className="slice-group">
                            <th scope="rowgroup" colSpan={5}>
                              {t(label)}
                            </th>
                          </tr>
                          {rows.map((slice) => (
                            <tr key={slice.key}>
                              <th scope="row">{t(slice.label)}</th>
                              <td>{slice.won}</td>
                              <td>{slice.lost}</td>
                              <td>{slice.voided}</td>
                              <td>{t(hitRateLabel(slice.won, slice.lost))}</td>
                            </tr>
                          ))}
                        </tbody>
                      ),
                  )}
                </table>
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
    </div>
  );
}

async function Wagers({
  userId,
  raw,
}: {
  userId: string;
  raw: Record<string, string | string[] | undefined>;
}) {
  const { t } = await getTranslation();
  const filters = {
    sport: sportSchema.parse(first(raw.sport)),
    outcome: outcomeSchema.parse(first(raw.outcome)),
    range: rangeSchema.parse(first(raw.range)),
    scope: scopeSchema.parse(first(raw.scope)),
  };
  const page = pageSchema.parse(first(raw.page));
  const history = await listWagerHistory(userId, {
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
  const selects = [
    {
      id: "you-sport",
      name: "sport",
      label: "Sport",
      value: filters.sport,
      options: [
        ["all", "All sports"],
        ["soccer", "Soccer"],
        ["baseball", "Baseball"],
      ],
    },
    {
      id: "you-outcome",
      name: "outcome",
      label: "Outcome",
      value: filters.outcome,
      options: [
        ["all", "All outcomes"],
        ["open", "Open"],
        ["won", "Won"],
        ["lost", "Lost"],
        ["void", "Void"],
      ],
    },
    {
      id: "you-range",
      name: "range",
      label: "Time range",
      value: filters.range,
      options: [
        ["all", "All time"],
        ["7d", "Last 7 days"],
        ["30d", "Last 30 days"],
        ["90d", "Last 90 days"],
      ],
    },
    {
      id: "you-scope",
      name: "scope",
      label: "Placed with",
      value: filters.scope,
      options: [
        ["all", "Solo and group"],
        ["solo", "Solo only"],
        ["group", "Group only"],
      ],
    },
  ] as const;

  return (
    <section className="panel" aria-labelledby="you-history-heading">
      <div className="panel-header">
        <h2 className="panel-title" id="you-history-heading">
          {t("History")}
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
        <input type="hidden" name="tab" value="bets" />
        {selects.map((select) => (
          <div key={select.id}>
            <label htmlFor={select.id} className="field-label">
              {t(select.label)}
            </label>
            <select
              id={select.id}
              name={select.name}
              className="control-select"
              defaultValue={select.value}
            >
              {select.options.map(([value, label]) => (
                <option key={value} value={value}>
                  {t(label)}
                </option>
              ))}
            </select>
          </div>
        ))}
        <Button type="submit" size="sm">
          {t("Apply filters")}
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
            {t("Prev")}
          </Button>
        )}
        {history.hasMore ? (
          <Button asChild variant="secondary" size="sm">
            <Link href={buildHref(filters, page + 1)}>{t("Next")}</Link>
          </Button>
        ) : (
          <Button variant="secondary" size="sm" disabled>
            {t("Next")}
          </Button>
        )}
      </div>
    </section>
  );
}

/* Everything that isn't a game or a group lives here, one full-height row
   each — on a phone these were otherwise 12px footer links. */
async function Preferences({
  email,
  resetCount,
}: {
  email: string | null | undefined;
  resetCount: Promise<number>;
}) {
  const { formatNumber, t } = await getTranslation();
  const resets = await resetCount;
  return (
    <section className="panel" aria-labelledby="you-settings-heading">
      <div className="panel-header">
        <h2 className="panel-title" id="you-settings-heading">
          {t("Settings")}
        </h2>
      </div>
      <div className="settings-list">
        <Link className="settings-row" href="/rules">
          <span>{t("Rules")}</span>
          <ChevronRight aria-hidden="true" size={18} />
        </Link>
        <Link className="settings-row" href="/system">
          <span>{t("System")}</span>
          <ChevronRight aria-hidden="true" size={18} />
        </Link>
        <div className="settings-row">
          <span>{t("Language")}</span>
          <LanguageSwitch />
        </div>
        <div className="settings-row">
          <span>
            {t("Reset your bankroll back to the starting balance.")}
            {resets > 0 && (
              <>
                {" "}
                <span className="fine-print">
                  {t("Times reset:")} {formatNumber(resets)}{" "}
                  {t("— a reset makes this record less meaningful.")}
                </span>
              </>
            )}
          </span>
          <ResetBankroll />
        </div>
        <form
          className="settings-row"
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <span>{email ?? t("Signed in")}</span>
          <Button type="submit" variant="secondary" size="sm">
            {t("Sign out")}
          </Button>
        </form>
      </div>
    </section>
  );
}

/** Holds a card's place while it streams, so the grid doesn't collapse. */
function CardLoading({ label }: { label: string }) {
  return (
    <div className="panel loading-panel" role="status" aria-label={label} />
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
