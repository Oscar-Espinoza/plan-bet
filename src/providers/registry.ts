import "server-only";

import type { Sport } from "@/lib/contracts";
import type { SportsProvider } from "@/providers/contracts";
import { FootballDataProvider } from "@/providers/football-data/provider";
import { MlbSportsProvider } from "@/providers/mlb-stats/provider";

const providers = {
  soccer: new FootballDataProvider(),
  baseball: new MlbSportsProvider(),
} satisfies Record<Sport, SportsProvider>;

export function getSportsProvider(sport: Sport): SportsProvider {
  return providers[sport];
}

export function getSportsProviders() {
  return providers;
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
  } as const;
}
