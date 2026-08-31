import type {
  BaseballContext,
  EvidenceFact,
  GameResult,
  GameSnapshot,
  GameStatus,
  SoccerContext,
  StatcastBatting,
  Team,
} from "@/lib/contracts";

/**
 * One line inside a context block. Two shapes, and only two:
 *
 * - a comparison, when `home` and/or `away` carry a value — the two sides sit
 *   in their own columns under the same label;
 * - a statement, when `value` and/or `note` carry it — label on the left,
 *   value on the right, prose underneath.
 *
 * Nothing here knows about the snapshot, so a component that renders a row
 * never needs to learn where the number came from.
 */
export type StatRow = {
  label?: string;
  value?: string;
  home?: string;
  away?: string;
  note?: string;
  /** "form" renders a W/D/L string as toned letters; "mono" forces figures. */
  format?: "form" | "mono";
};

export type ContextBlock = {
  id: string;
  title: string;
  rows: StatRow[];
  /** Secondary rows, rendered inside a `<details open>` under `rows`. */
  detail?: StatRow[];
};

export type MatchView = {
  identity: {
    competition: string;
    stage?: string;
    homeTeam: string;
    awayTeam: string;
    trackedSide: "home" | "away";
    clubColor: string;
  };
  timing: {
    scheduledAt: string;
    venue?: string;
    status: GameStatus;
    result?: GameResult;
  };
  blocks: ContextBlock[];
};

/**
 * Provider names disagree on suffixes — the stored summary says "Real Madrid
 * CF" where apifootball says "Real Madrid" — and no two vendors share an id.
 *
 * ponytail: naive containment match, the same one `src/data/fixture-facts.ts`
 * uses to build these facts in the first place. Duplicated rather than
 * imported because that module pulls in provider modules this file must stay
 * clear of; pin a per-team id map if a vendor ever disagrees harder than this.
 */
function sameTeam(a: string, b: string) {
  const left = a.toLowerCase().trim();
  const right = b.toLowerCase().trim();
  return left === right || left.includes(right) || right.includes(left);
}

/** Facts whose label is "<team> <suffix>", paired back to a side. */
function scoped(
  facts: EvidenceFact[],
  pattern: RegExp,
  homeTeam: string,
  awayTeam: string,
) {
  const out: { side: "home" | "away"; value: string }[] = [];
  for (const fact of facts) {
    const named = pattern.exec(fact.label)?.[1];
    if (!named) continue;
    const side = sameTeam(named, homeTeam)
      ? "home"
      : sameTeam(named, awayTeam)
        ? "away"
        : undefined;
    if (side) out.push({ side, value: fact.value });
  }
  return out;
}

function plain(facts: EvidenceFact[], label: string) {
  return facts.find((fact) => fact.label === label)?.value;
}

function pick(
  rows: { side: "home" | "away"; value: string }[],
  side: "home" | "away",
) {
  return rows.find((row) => row.side === side)?.value;
}

/** `{ home, away }` with the tracked team's own value dropped into its side. */
function pair(
  fromFacts: { side: "home" | "away"; value: string }[],
  trackedSide: "home" | "away",
  tracked: string | undefined,
) {
  const home =
    pick(fromFacts, "home") ?? (trackedSide === "home" ? tracked : undefined);
  const away =
    pick(fromFacts, "away") ?? (trackedSide === "away" ? tracked : undefined);
  return { home, away };
}

/** A row survives only if it carries something. */
function row(candidate: StatRow): StatRow[] {
  return (candidate.value ?? candidate.home ?? candidate.away ?? candidate.note)
    ? [candidate]
    : [];
}

function block(
  id: string,
  title: string,
  rows: StatRow[],
  detail?: StatRow[],
): ContextBlock[] {
  return rows.length
    ? [{ id, title, rows, ...(detail?.length ? { detail } : {}) }]
    : [];
}

/** ".262", the way a batting figure is written. */
function decimal(value: number) {
  return value.toFixed(3).replace(/^0/, "");
}

/** Letters only: the fact value carries "(most recent first)" behind them. */
function formLetters(value: string | undefined) {
  return /^[WDL]+/.exec(value ?? "")?.[0];
}

const TABLE_LINE =
  /^(\d+) of the league on (\d+) points from (\d+) played, (\d+)-(\d+) on goals/;
const RECORD_LINE =
  /^(\d+-\d+) through (\d+) games, run differential ([+-]?\d+)(?:, on a (win|losing) streak of (\d+))?/;

function soccerBlocks(
  context: SoccerContext,
  facts: EvidenceFact[],
  homeTeam: string,
  awayTeam: string,
  trackedSide: "home" | "away",
): ContextBlock[] {
  const forms = scoped(facts, /^(.+) recent form$/, homeTeam, awayTeam);
  const form = pair(
    forms.map((entry) => ({
      side: entry.side,
      value: formLetters(entry.value) ?? "",
    })),
    trackedSide,
    context.recentForm.join("") || undefined,
  );

  const tables = scoped(facts, /^(.+) in the table$/, homeTeam, awayTeam);
  const parsed = tables.map((entry) => ({
    side: entry.side,
    match: TABLE_LINE.exec(entry.value),
    raw: entry.value,
  }));
  const at = (side: "home" | "away", group: number) =>
    parsed.find((entry) => entry.side === side)?.match?.[group];
  const position = pair(
    parsed.flatMap((entry) =>
      entry.match ? [{ side: entry.side, value: `#${entry.match[1]}` }] : [],
    ),
    trackedSide,
    context.tablePosition ? `#${context.tablePosition}` : undefined,
  );
  const points = pair(
    parsed.flatMap((entry) =>
      entry.match ? [{ side: entry.side, value: entry.match[2]! }] : [],
    ),
    trackedSide,
    context.points === undefined ? undefined : String(context.points),
  );
  const goals = {
    home: at("home", 4) && `${at("home", 4)}-${at("home", 5)}`,
    away: at("away", 4) && `${at("away", 4)}-${at("away", 5)}`,
  };
  // A sentence the regex could not read is still worth showing — as prose,
  // not as a column that would line up against nothing.
  const unparsed = parsed
    .filter((entry) => !entry.match)
    .map((entry) => ({ note: entry.raw }));

  return [
    ...block(
      "form",
      "Form",
      row({ label: "Last five", ...form, format: "form" }),
    ),
    ...block("table", "Table", [
      ...row({ label: "Position", ...position, format: "mono" }),
      ...row({ label: "Points", ...points, format: "mono" }),
      ...row({ label: "Goals", ...goals, format: "mono" }),
      ...row({
        label: "Record",
        ...(trackedSide === "home"
          ? { home: context.record }
          : { away: context.record }),
        format: "mono",
      }),
      ...unparsed,
    ]),
  ];
}

function statcastDetail(
  label: string,
  home: StatcastBatting | undefined,
  away: StatcastBatting | undefined,
  read: (value: StatcastBatting) => string,
): StatRow[] {
  return row({
    label,
    home: home && read(home),
    away: away && read(away),
    format: "mono",
  });
}

function baseballBlocks(
  context: BaseballContext,
  facts: EvidenceFact[],
  homeTeam: string,
  awayTeam: string,
  trackedSide: "home" | "away",
  team: Team,
): ContextBlock[] {
  const forms = scoped(facts, /^(.+) recent form$/, homeTeam, awayTeam);
  const form = pair(
    forms.map((entry) => ({
      side: entry.side,
      value: formLetters(entry.value) ?? "",
    })),
    trackedSide,
    context.recentForm.join("") || undefined,
  );

  const records = scoped(facts, /^(.+) record$/, homeTeam, awayTeam).map(
    (entry) => ({
      side: entry.side,
      match: RECORD_LINE.exec(entry.value),
      raw: entry.value,
    }),
  );
  const fromRecord = (group: number) =>
    records.flatMap((entry) =>
      entry.match?.[group]
        ? [{ side: entry.side, value: entry.match[group]! }]
        : [],
    );
  const record = pair(fromRecord(1), trackedSide, context.record);
  const diff = pair(fromRecord(3), trackedSide, undefined);
  const division =
    context.divisionRank === undefined ? undefined : `#${context.divisionRank}`;
  const streakOf = (side: "home" | "away") => {
    const found = records.find((entry) => entry.side === side)?.match;
    return found?.[4]
      ? `${found[4] === "win" ? "W" : "L"}${found[5]}`
      : undefined;
  };
  const streak = { home: streakOf("home"), away: streakOf("away") };

  // The tracked team's platoon split only means anything against a specific
  // hand, so it rides on the opposing pitcher's row rather than floating in a
  // block of its own where the reader has to join the two by eye.
  const pitchers = context.probablePitchers.map((pitcher) => {
    const mine =
      sameTeam(pitcher.team, team.name) ||
      sameTeam(pitcher.team, team.shortName);
    const split =
      pitcher.throws === "L" ? context.splits?.vsLeft : context.splits?.vsRight;
    const notes = [
      pitcher.throws && `Throws ${pitcher.throws}`,
      pitcher.era && `${pitcher.era} ERA`,
      !mine && pitcher.throws && split
        ? `${team.shortName} vs ${pitcher.throws}HP ${split}`
        : undefined,
    ].filter(Boolean);
    return {
      label: pitcher.team,
      value: pitcher.name,
      note: notes.length ? notes.join(" · ") : undefined,
    };
  });

  const home =
    trackedSide === "home"
      ? context.statcast?.trackedTeam
      : context.statcast?.opponent;
  const away =
    trackedSide === "away"
      ? context.statcast?.trackedTeam
      : context.statcast?.opponent;
  // Over- or under-performing its own contact quality: two stored numbers
  // compared, not a judgement about the team.
  const heat = (value: StatcastBatting | undefined) =>
    value === undefined
      ? undefined
      : value.woba > value.expectedWoba
        ? "finishing above its contact"
        : value.woba < value.expectedWoba
          ? "finishing below its contact"
          : "finishing level with its contact";
  const bats = [
    ...row({
      label: home?.team,
      value: home && `${decimal(home.expectedWoba)} xwOBA`,
      note: heat(home),
    }),
    ...row({
      label: away?.team,
      value: away && `${decimal(away.expectedWoba)} xwOBA`,
      note: heat(away),
    }),
  ];

  return [
    ...block("form", "Form", [
      ...row({ label: "Last five", ...form, format: "form" }),
      ...row({
        label: "Last ten",
        ...(trackedSide === "home"
          ? { home: context.lastTen }
          : { away: context.lastTen }),
        format: "mono",
      }),
    ]),
    ...block("standing", "Standing", [
      ...row({ label: "Record", ...record, format: "mono" }),
      ...row({
        label: "Division",
        ...(trackedSide === "home" ? { home: division } : { away: division }),
        format: "mono",
      }),
      ...row({ label: "Run diff", ...diff, format: "mono" }),
      ...row({ label: "Streak", ...streak, format: "mono" }),
    ]),
    ...block("pitchers", "Probable pitchers", pitchers.flatMap(row)),
    ...block("bats", "Bats", bats, [
      ...statcastDetail("PA", home, away, (v) => String(v.plateAppearances)),
      ...statcastDetail("Balls in play", home, away, (v) =>
        String(v.ballsInPlay),
      ),
      ...statcastDetail(
        "BA / xBA",
        home,
        away,
        (v) =>
          `${decimal(v.battingAverage)} / ${decimal(v.expectedBattingAverage)}`,
      ),
      ...statcastDetail(
        "SLG / xSLG",
        home,
        away,
        (v) => `${decimal(v.slugging)} / ${decimal(v.expectedSlugging)}`,
      ),
      ...statcastDetail(
        "wOBA / xwOBA",
        home,
        away,
        (v) => `${decimal(v.woba)} / ${decimal(v.expectedWoba)}`,
      ),
    ]),
  ];
}

/**
 * The snapshot, read once, into the only shape this page's components see.
 *
 * Structured `context` describes the tracked team alone; the opponent's form,
 * table and injuries exist only as evidence facts, so the two are merged here
 * — that merge is what makes a real side-by-side possible. Anything the page
 * has no value for produces no row, and a block with no rows never renders:
 * there is no "Not provided" on this surface.
 */
export function buildMatchView(snapshot: GameSnapshot, team: Team): MatchView {
  const { game, context, evidenceFacts } = snapshot;
  const trackedSide = game.homeTeamSlug === team.slug ? "home" : "away";
  const facts = evidenceFacts.filter((fact) => fact.valueType !== "datetime");

  const shared = [
    ...block(
      "h2h",
      "Head to head",
      row({ note: plain(facts, "Head to head") }),
    ),
    ...block("model", "Model lean", row({ note: plain(facts, "Model lean") })),
    ...block("out", "Unavailable", [
      ...context.availability.map((entry) => ({
        label: entry.name,
        value: entry.status,
        note: entry.note,
      })),
      ...scoped(facts, /^(.+) unavailable$/, game.homeTeam, game.awayTeam).map(
        (entry) => ({
          label: entry.side === "home" ? game.homeTeam : game.awayTeam,
          note: entry.value,
        }),
      ),
    ]),
    ...block(
      "notes",
      "Notes",
      (context.matchupNotes ?? []).map((note) => ({ note })),
    ),
  ];

  return {
    identity: {
      competition: game.competition,
      stage: plain(facts, "Competition stage") ?? plain(facts, "Series"),
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      trackedSide,
      clubColor: team.colors.primary,
    },
    timing: {
      scheduledAt: game.scheduledAt,
      venue: game.venue?.trim() || undefined,
      status: game.status,
      result: game.result,
    },
    blocks: [
      ...(context.kind === "soccer"
        ? soccerBlocks(
            context,
            facts,
            game.homeTeam,
            game.awayTeam,
            trackedSide,
          )
        : baseballBlocks(
            context,
            facts,
            game.homeTeam,
            game.awayTeam,
            trackedSide,
            team,
          )),
      ...shared,
    ],
  };
}
