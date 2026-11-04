import type { GameSchedule, TeamSlug } from "../server/domain/contracts";
import type { SportPreference } from "./sport-preference";

export type SportFilter = SportPreference;

/** What the board renders — a team's `context` stays on the server. */
export type BoardData = Record<
  TeamSlug,
  Pick<GameSchedule, "team" | "games" | "freshness">
>;
