import "server-only";

import { isAuthConfigured } from "@/lib/auth-config";
import type { Sport } from "@/lib/contracts";
import type { SportsProvider } from "@/providers/contracts";
import { FootballDataProvider } from "@/providers/football-data/provider";
import { MlbSportsProvider } from "@/providers/mlb-stats/provider";
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
