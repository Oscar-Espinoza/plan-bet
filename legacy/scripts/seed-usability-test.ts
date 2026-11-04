/**
 * Seeds the fixture data the R0/R1 usability sessions need (see the test
 * plan's pilot checklist):
 *
 *   T2 "Where do I stand" — ~30 settled wagers over ~6 weeks, both sports,
 *      mixed outcomes, net slightly down. A losing record is harder to read
 *      off a UI than a winning one, so the fixture is deliberately negative.
 *   T4 "Answer the group" — a group with two other members, recent activity,
 *      and one open wager from Dani on the Yankees to bet against.
 *
 * Usage: pnpm test:seed <email>
 *
 * <email> is the address the participant will sign in with. The user row is
 * created if absent; OAuth links to it on first sign-in via
 * allowDangerousEmailAccountLinking.
 *
 * DESTRUCTIVE for that one user: their wagers and credit entries are deleted
 * and rebuilt so re-runs between sessions are identical. That deliberately
 * breaks the append-only rule the application code obeys — a fixture builder
 * is not application code, and every participant must see the same numbers.
 * It touches no other user and no provider data.
 *
 * Wagers denormalize matchup/competition/scheduledAt at placement, so this
 * history needs no `games` rows and survives snapshot expiry. Tasks that
 * need a *placeable* game (T1, T3, T6) need a real refresh instead — this
 * script does not fake upcoming games.
 */
import { eq, inArray } from "drizzle-orm";

import { STARTING_CREDITS } from "../src/data/credits";
import {
  creditEntries,
  groupMembers,
  groups,
  users,
  wagers,
} from "../src/db/schema";
import { withDatabaseTransaction } from "../src/db/client";
import { HOUSE_PRICES_VERSION, resolveSelection } from "../src/lib/markets";
import { RULES_VERSION } from "../src/lib/utils";
import type { Grade } from "../src/lib/markets";
import type { Sport } from "../src/lib/contracts";

const email = process.argv[2];
if (!email?.includes("@")) {
  console.error("Usage: pnpm test:seed <email>");
  process.exit(1);
}

const GROUP_NAME = "Sunday League";
const GROUP_SLUG = "sunday-league";
const NOW = new Date();
const HISTORY_WAGERS = 30;

/** Deterministic so every participant sees identical numbers. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(20260821);

const pick = <T>(items: readonly T[]): T =>
  items[Math.floor(random() * items.length)]!;

const daysAgo = (days: number): Date =>
  new Date(NOW.getTime() - days * 86_400_000);

type Fixture = {
  sport: Sport;
  canonicalGameId: string;
  routeId: string;
  matchup: string;
  competition: string;
};

const FIXTURES: readonly Fixture[] = [
  {
    sport: "soccer",
    canonicalGameId: "football-data-564645",
    routeId: "football-data-564645-real-madrid",
    matchup: "Real Madrid vs Sevilla",
    competition: "La Liga",
  },
  {
    sport: "soccer",
    canonicalGameId: "football-data-564702",
    routeId: "football-data-564702-fc-barcelona",
    matchup: "FC Barcelona vs Valencia",
    competition: "La Liga",
  },
  {
    sport: "soccer",
    canonicalGameId: "football-data-564810",
    routeId: "football-data-564810-real-madrid",
    matchup: "Atletico Madrid vs Real Madrid",
    competition: "La Liga",
  },
  {
    sport: "baseball",
    canonicalGameId: "mlb-778201",
    routeId: "mlb-778201-new-york-yankees",
    matchup: "New York Yankees vs Toronto Blue Jays",
    competition: "MLB Regular Season",
  },
  {
    sport: "baseball",
    canonicalGameId: "mlb-778340",
    routeId: "mlb-778340-boston-red-sox",
    matchup: "Boston Red Sox vs Tampa Bay Rays",
    competition: "MLB Regular Season",
  },
  {
    sport: "baseball",
    canonicalGameId: "mlb-778455",
    routeId: "mlb-778455-new-york-yankees",
    matchup: "New York Yankees vs Boston Red Sox",
    competition: "MLB Regular Season",
  },
];

const MARKETS: Record<Sport, readonly [string, readonly string[]][]> = {
  soccer: [
    ["soccer-match-result", ["home", "draw", "away"]],
    ["soccer-total-2-5", ["over", "under"]],
    ["soccer-btts", ["yes", "no"]],
  ],
  baseball: [
    ["baseball-moneyline", ["home", "away"]],
    ["baseball-total-8-5", ["over", "under"]],
  ],
};

type SeedWager = typeof wagers.$inferInsert & { grade: Grade | null };

/** Builds one wager row, resolving label and price from the real price table. */
function buildWager(
  userId: string,
  groupId: string | null,
  fixture: Fixture,
  placedAt: Date,
  grade: Grade | null,
): SeedWager {
  const [marketId, selectionIds] = pick(MARKETS[fixture.sport]);
  const selectionId = pick(selectionIds);
  const resolved = resolveSelection(fixture.sport, marketId, selectionId);
  if (!resolved) throw new Error(`Unresolvable fixture market ${marketId}`);

  const stake = 5 * (1 + Math.floor(random() * 10)); // 5..50
  return {
    userId,
    groupId,
    canonicalGameId: fixture.canonicalGameId,
    routeId: fixture.routeId,
    sport: fixture.sport,
    marketId,
    selectionId,
    marketLabel: resolved.market.label,
    selectionLabel: resolved.selection.label,
    line: resolved.market.line ?? null,
    price: resolved.selection.price,
    stake,
    potentialReturn: Math.round(stake * resolved.selection.price),
    matchup: fixture.matchup,
    competition: fixture.competition,
    scheduledAt: placedAt,
    pricesVersion: HOUSE_PRICES_VERSION,
    rulesVersion: RULES_VERSION,
    createdAt: placedAt,
    grade,
  };
}

/**
 * Weighted to land the participant slightly down: a 40% strike rate against
 * decimal prices averaging ~2.0 is a small, believable loss, not a wipeout.
 */
function rollGrade(): Grade {
  const roll = random();
  if (roll < 0.4) return "won";
  if (roll < 0.95) return "lost";
  return "void";
}

const summary = await withDatabaseTransaction(async (transaction) => {
  const existing = await transaction
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));

  const participantId =
    existing[0]?.id ??
    (
      await transaction
        .insert(users)
        .values({ name: email.split("@")[0]!, email })
        .returning({ id: users.id })
    )[0]!.id;

  // Two synthetic opponents. Emails are unroutable by design — nobody should
  // be able to sign in as them, and group notification mail must not escape.
  const opponents: { id: string; name: string }[] = [];
  for (const name of ["Dani", "Sam"]) {
    const address = `${name.toLowerCase()}@usability.invalid`;
    const found = await transaction
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, address));
    const id =
      found[0]?.id ??
      (
        await transaction
          .insert(users)
          .values({ name, email: address })
          .returning({ id: users.id })
      )[0]!.id;
    opponents.push({ id, name });
  }

  const everyone = [participantId, ...opponents.map((o) => o.id)];

  // Rebuild from scratch: credit entries first (they reference wagers).
  await transaction
    .delete(creditEntries)
    .where(inArray(creditEntries.userId, everyone));
  await transaction.delete(wagers).where(inArray(wagers.userId, everyone));

  const foundGroup = await transaction
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.slug, GROUP_SLUG));
  const groupId =
    foundGroup[0]?.id ??
    (
      await transaction
        .insert(groups)
        .values({
          name: GROUP_NAME,
          slug: GROUP_SLUG,
          createdByUserId: participantId,
          createdAt: daysAgo(40),
        })
        .returning({ id: groups.id })
    )[0]!.id;

  for (const [index, userId] of everyone.entries()) {
    await transaction
      .insert(groupMembers)
      .values({
        groupId,
        userId,
        role: index === 0 ? "owner" : "member",
        joinedAt: daysAgo(40 - index),
      })
      .onConflictDoNothing();
  }

  const grants = everyone.map((userId) => ({
    userId,
    kind: "grant" as const,
    amount: STARTING_CREDITS,
    reason: "signup",
    createdAt: daysAgo(42),
  }));
  await transaction.insert(creditEntries).values(grants);

  const planned: SeedWager[] = [];

  // T2: the participant's own history, spread across ~6 weeks. Every fourth
  // one is tagged to the group so the solo|group scope filter has both sides.
  for (let index = 0; index < HISTORY_WAGERS; index += 1) {
    const placedAt = daysAgo(41 - index * 1.3);
    planned.push(
      buildWager(
        participantId,
        index % 4 === 0 ? groupId : null,
        pick(FIXTURES),
        placedAt,
        rollGrade(),
      ),
    );
  }

  // T4: opponents need settled group wagers so the leaderboard has rows.
  for (const opponent of opponents) {
    for (let index = 0; index < 6; index += 1) {
      planned.push(
        buildWager(
          opponent.id,
          groupId,
          pick(FIXTURES),
          daysAgo(30 - index * 4),
          rollGrade(),
        ),
      );
    }
  }

  // T4's prompt names this exact wager: Dani, Yankees, still open.
  const yankees = FIXTURES.find((f) => f.canonicalGameId === "mlb-778455")!;
  const dani = opponents[0]!;
  const daniPick = buildWager(dani.id, groupId, yankees, daysAgo(0.2), null);
  daniPick.marketId = "baseball-moneyline";
  daniPick.selectionId = "home";
  daniPick.marketLabel = "Moneyline";
  daniPick.selectionLabel = "Home";
  daniPick.line = null;
  daniPick.price = 1.85;
  daniPick.stake = 40;
  daniPick.potentialReturn = 74;
  planned.push(daniPick);

  const inserted = await transaction
    .insert(wagers)
    .values(planned.map((row) => ({ ...row, grade: undefined })))
    .returning({ id: wagers.id });

  // Stake out on every wager; return only on the settled ones. Mirrors what
  // wagers.ts and settlement.ts write, minus the lease and the advisory lock.
  const ledger: (typeof creditEntries.$inferInsert)[] = [];
  planned.forEach((wager, index) => {
    const id = inserted[index]!.id;
    ledger.push({
      userId: wager.userId,
      kind: "stake",
      amount: -wager.stake,
      reason: "wager placed",
      wagerId: id,
      createdAt: wager.createdAt as Date,
    });
    if (!wager.grade) return;
    const amount =
      wager.grade === "won"
        ? wager.potentialReturn
        : wager.grade === "void"
          ? wager.stake
          : 0;
    ledger.push({
      userId: wager.userId,
      kind: "return",
      amount,
      reason: "wager settled",
      wagerId: id,
      outcome: wager.grade,
      createdAt: new Date((wager.createdAt as Date).getTime() + 7_200_000),
    });
  });
  await transaction.insert(creditEntries).values(ledger);

  const mine = planned.filter((w) => w.userId === participantId);
  return {
    participantId,
    groupId,
    balance:
      STARTING_CREDITS +
      ledger
        .filter((entry) => entry.userId === participantId)
        .reduce((total, entry) => total + entry.amount, 0),
    settled: mine.filter((w) => w.grade).length,
    won: mine.filter((w) => w.grade === "won").length,
    lost: mine.filter((w) => w.grade === "lost").length,
    voided: mine.filter((w) => w.grade === "void").length,
    grouped: mine.filter((w) => w.groupId).length,
    openForDani: 1,
  };
});

// The fixture is only useful if it holds the properties the tasks depend on.
// Anything failing here means a session would have produced junk data.
const check = (ok: boolean, message: string) => {
  if (!ok) throw new Error(`Fixture invariant failed: ${message}`);
};
check(summary.settled === HISTORY_WAGERS, "T2 needs 30 settled wagers");
check(summary.won > 0 && summary.lost > 0, "T2 needs mixed outcomes");
check(
  summary.balance < STARTING_CREDITS,
  "T2 fixture must be net down, not up",
);
check(summary.balance > 0, "T2 balance must stay above zero");
check(summary.grouped > 0, "the solo|group scope filter needs both sides");

console.info(
  [
    `Seeded usability fixture for ${email}`,
    `  balance   ${summary.balance} credits (started at ${STARTING_CREDITS})`,
    `  record    ${summary.won}W ${summary.lost}L ${summary.voided}V over ${summary.settled} settled`,
    `  grouped   ${summary.grouped} of ${HISTORY_WAGERS} tagged to ${GROUP_NAME}`,
    `  group     /groups/${GROUP_SLUG} — you (owner), Dani, Sam`,
    `  T4 target Dani has an open 40-credit Yankees moneyline`,
    "",
    "T1/T3/T6 still need real upcoming games:",
    "  pnpm data:refresh:soccer && pnpm data:refresh:baseball",
  ].join("\n"),
);
