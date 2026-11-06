import { redirect } from "@sveltejs/kit";
import { z } from "zod";
import { requireAccount } from "#lib/server/auth";
import { getCreditSummary } from "#lib/server/data/credits";
import { toSlipWager } from "#lib/server/data/slip-wager";
import {
  countOpenWagers,
  getRecordSlices,
  listWagerHistory,
} from "#lib/server/data/wagers-repository";
import { getTranslation } from "#lib/server/locale";
import type {
  HistoryView,
  OpenWagersView,
  RecordSliceView,
  Standing,
} from "#lib/shared/wager-view";
import type { PageServerLoad } from "./$types";

const PAGE_SIZE = 20;

const sportSchema = z.enum(["all", "soccer", "baseball"]).catch("all");
const outcomeSchema = z
  .enum(["all", "won", "lost", "void", "open"])
  .catch("all");
const rangeSchema = z.enum(["all", "7d", "30d", "90d"]).catch("all");
const scopeSchema = z.enum(["all", "solo", "group"]).catch("all");
const pageSchema = z.coerce.number().int().min(1).catch(1);
const tabSchema = z.enum(["overview", "bets", "settings"]).catch("overview");

const RANGE_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

function sinceFor(range: string): Date | undefined {
  const days = RANGE_DAYS[range];
  return days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : undefined;
}

export const load: PageServerLoad = async (event) => {
  const { t } = getTranslation({
    cookieLocale: event.locals.locale,
    acceptLanguage: event.request.headers.get("accept-language"),
  });
  const title = t("You");
  const account = requireAccount(event);

  if (!account.ok && account.reason === "unconfigured") {
    return { status: "unconfigured" as const, title };
  }
  if (!account.ok) redirect(303, "/sign-in?callbackUrl=/you");

  const params = event.url.searchParams;
  const filters = {
    sport: sportSchema.parse(params.get("sport") ?? undefined),
    outcome: outcomeSchema.parse(params.get("outcome") ?? undefined),
    range: rangeSchema.parse(params.get("range") ?? undefined),
    scope: scopeSchema.parse(params.get("scope") ?? undefined),
  };
  const page = pageSchema.parse(params.get("page") ?? undefined);
  const tab = tabSchema.parse(params.get("tab") ?? undefined);
  const summaryPromise = getCreditSummary(account.userId);

  const standing: Promise<Standing> = summaryPromise.then((summary) => ({
    balance: summary.balance,
    won: summary.won,
    lost: summary.lost,
    voided: summary.voided,
    net: summary.net,
  }));

  const open: Promise<OpenWagersView> = Promise.all([
    countOpenWagers(account.userId),
    listWagerHistory(account.userId, {
      outcome: "open",
      limit: 5,
      offset: 0,
    }),
  ]).then(([count, history]) => ({
    count,
    items: history.items.map(toSlipWager),
  }));

  const settled: Promise<HistoryView> = listWagerHistory(account.userId, {
    outcome: "settled",
    limit: 3,
    offset: 0,
  }).then((history) => ({
    items: history.items.map(toSlipWager),
    hasMore: history.hasMore,
  }));

  const slices: Promise<{
    bySport: RecordSliceView[];
    byMarket: RecordSliceView[];
  }> = getRecordSlices(account.userId);

  const history: Promise<HistoryView> = listWagerHistory(account.userId, {
    sport: filters.sport === "all" ? undefined : filters.sport,
    outcome: filters.outcome === "all" ? undefined : filters.outcome,
    since: sinceFor(filters.range),
    scope: filters.scope === "all" ? undefined : filters.scope,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  }).then((rows) => ({
    items: rows.items.map(toSlipWager),
    hasMore: rows.hasMore,
  }));

  // Commit the account surface with its actual panel sizes. These reads all
  // start together; navigation retains the previous screen while they finish.
  const [
    resolvedSummary,
    resolvedOpen,
    resolvedSettled,
    resolvedSlices,
    resolvedHistory,
    resetCount,
  ] = await Promise.all([
    standing,
    open,
    settled,
    slices,
    history,
    summaryPromise.then((summary) => summary.resetCount),
  ]);

  return {
    status: "ready" as const,
    title,
    name: account.name,
    email: account.email,
    tab,
    filters,
    page,
    summary: resolvedSummary,
    open: resolvedOpen,
    settled: resolvedSettled,
    slices: resolvedSlices,
    history: resolvedHistory,
    resetCount,
  };
};
