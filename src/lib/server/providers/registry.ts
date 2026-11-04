import { isAuthConfigured } from "../auth-config";
import type { Sport } from "../domain/contracts";
import type { SportsProvider } from "./contracts";
import { FootballDataProvider } from "./football-data/provider";
import { MlbSportsProvider } from "./mlb-stats/provider";
import { isApiFootballConfigured } from "./apifootball/provider";
import { isBigBallsConfigured } from "./bigballs/provider";
import { isOpenAiConfigured } from "./openai/client";

const providers = {
  soccer: new FootballDataProvider(),
  baseball: new MlbSportsProvider(),
} satisfies Record<Sport, SportsProvider>;

export function getSportsProvider(sport: Sport): SportsProvider {
  return providers[sport];
}

export function getProviderHealthDefinitions() {
  return {
    footballData: {
      provider: providers.soccer.provider,
      configured: providers.soccer.isConfigured(),
    },
    mlbStats: {
      provider: providers.baseball.provider,
      configured: providers.baseball.isConfigured(),
    },
    baseballSavant: {
      provider: "baseball-savant",
      configured: true,
    },
    // Both context arms are written by the one "fixture-context" enrich run,
    // so they share its recency and differ only in whether their own
    // credentials are present. A pure environment check either way.
    apifootball: {
      provider: "fixture-context",
      configured: isApiFootballConfigured(),
    },
    bigballs: {
      provider: "fixture-context",
      configured: isBigBallsConfigured(),
    },
    // A pure environment check. Health must never spend OpenAI tokens.
    openai: {
      provider: "openai",
      configured: isOpenAiConfigured(),
    },
    // A pure environment check. Health must never start a session or hit an
    // OAuth provider.
    auth: {
      provider: "auth",
      configured: isAuthConfigured(),
    },
  } as const;
}
