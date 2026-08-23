import { z } from "zod";

/**
 * API-Sports wraps every response in the same five keys and returns HTTP 200
 * with a populated `errors` object on failure, so the envelope is parsed
 * loosely first: `errors` decides whether `response` is data at all.
 * `errors` is `[]` when empty and a `{ field: message }` map when not.
 */
export const apiSportsEnvelopeSchema = z.object({
  errors: z.union([z.array(z.unknown()), z.record(z.string(), z.string())]),
  results: z.number().int().nonnegative().optional(),
  response: z.unknown(),
});

export function envelopeErrorMessages(
  errors: z.infer<typeof apiSportsEnvelopeSchema>["errors"],
) {
  return Array.isArray(errors)
    ? errors.map(String)
    : Object.entries(errors).map(([field, message]) => `${field}: ${message}`);
}

export const apiSportsStatusSchema = z.object({
  subscription: z.object({
    plan: z.string().min(1),
    active: z.boolean(),
    end: z.string().nullable().optional(),
  }),
  requests: z.object({
    current: z.number().int().nonnegative(),
    limit_day: z.number().int().nonnegative(),
  }),
});
export type ApiSportsStatus = z.infer<typeof apiSportsStatusSchema>;

/**
 * One fixture, flattened from the two vendor shapes. Football nests everything
 * under `fixture`; baseball puts the same fields at the top level. Both
 * transform into this so `matchFixture` and the cache are sport-generic.
 */
export type ApiSportsFixture = {
  id: number;
  kickoff: string;
  status: string;
  league: string;
  homeTeamId: number;
  homeTeam: string;
  awayTeamId: number;
  awayTeam: string;
};

const teamRefSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
});

export const footballFixtureSchema = z
  .object({
    fixture: z.object({
      id: z.number().int().positive(),
      date: z.iso.datetime({ offset: true }),
      status: z.object({ short: z.string().min(1) }),
    }),
    league: z.object({ name: z.string().min(1) }),
    teams: z.object({ home: teamRefSchema, away: teamRefSchema }),
  })
  .transform(({ fixture, league, teams }): ApiSportsFixture => ({
    id: fixture.id,
    kickoff: new Date(fixture.date).toISOString(),
    status: fixture.status.short,
    league: league.name,
    homeTeamId: teams.home.id,
    homeTeam: teams.home.name,
    awayTeamId: teams.away.id,
    awayTeam: teams.away.name,
  }));

export const baseballGameSchema = z
  .object({
    id: z.number().int().positive(),
    date: z.iso.datetime({ offset: true }),
    status: z.object({ short: z.string().min(1) }),
    league: z.object({ name: z.string().min(1) }),
    teams: z.object({ home: teamRefSchema, away: teamRefSchema }),
  })
  .transform(({ id, date, status, league, teams }): ApiSportsFixture => ({
    id,
    kickoff: new Date(date).toISOString(),
    status: status.short,
    league: league.name,
    homeTeamId: teams.home.id,
    homeTeam: teams.home.name,
    awayTeamId: teams.away.id,
    awayTeam: teams.away.name,
  }));

export type ApiSportsTeamMatch = { id: number; name: string; country?: string };

export const footballTeamsSchema = z.array(
  z
    .object({
      team: z.object({
        id: z.number().int().positive(),
        name: z.string().min(1),
        country: z.string().nullable().optional(),
      }),
    })
    .transform(({ team }): ApiSportsTeamMatch => ({
      id: team.id,
      name: team.name,
      country: team.country ?? undefined,
    })),
);

export const baseballTeamsSchema = z.array(
  z
    .object({
      id: z.number().int().positive(),
      name: z.string().min(1),
      country: z.object({ name: z.string() }).nullable().optional(),
    })
    .transform((team): ApiSportsTeamMatch => ({
      id: team.id,
      name: team.name,
      country: team.country?.name,
    })),
);

export const footballFixturesSchema = z.array(footballFixtureSchema);
export const baseballGamesSchema = z.array(baseballGameSchema);
