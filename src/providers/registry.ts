import "server-only";

import { isAuthConfigured } from "@/lib/auth-config";
import type { Sport } from "@/lib/contracts";
import type { SportsProvider } from "@/providers/contracts";
import { FootballDataProvider } from "@/providers/football-data/provider";
import { MlbSportsProvider } from "@/providers/mlb-stats/provider";
import { isApiFootballConfigured } from "@/providers/apifootball/provider";
import { isBigBallsConfigured } from "@/providers/bigballs/provider";
import { isOpenAiConfigured } from "@/providers/openai/client";

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
