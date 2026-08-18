import "server-only";

import type {
  GameSchedule,
  GameSnapshot,
  Sport,
  Team,
  TeamSlug,
} from "@/lib/contracts";
import type { ProviderErrorCode } from "@/providers/provider-error";

export type CachedTeamMetadata = {
  team: Team;
  providerExternalId: string;
  sourceObservedAt: Date;
  expiresAt: Date;
};

export type ProviderSnapshot = {
  providerGameId: string;
  canonicalGameId: string;
  route: {
    id: string;
    teamSlug: TeamSlug;
  };
  snapshot: GameSnapshot;
};

export type CanonicalTeamBundle = {
  provider: string;
  providerExternalId: string;
  metadataRefreshed: boolean;
  metadataObservedAt: Date;
  schedule: GameSchedule;
  snapshots: ProviderSnapshot[];
};

export type ProviderRefreshFailure = {
  teamSlug?: TeamSlug;
  code: ProviderErrorCode | "persistence_error";
};

export type ProviderDiagnostic = {
  provider: string;
  operation: string;
  status: "succeeded" | "failed";
  code?: ProviderErrorCode;
  message?: string;
};

export type ProviderRefreshResult = {
  bundles: CanonicalTeamBundle[];
  failures: ProviderRefreshFailure[];
  diagnostics?: ProviderDiagnostic[];
};

export type SportsProvider = {
  readonly sport: Sport;
  readonly provider: string;
  readonly refreshOperation: string;
  readonly refreshScope: string;
  readonly teamSlugs: readonly TeamSlug[];
  isConfigured(): boolean;
  refresh(input: {
    now: Date;
    cachedTeams: Partial<Record<TeamSlug, CachedTeamMetadata>>;
  }): Promise<ProviderRefreshResult>;
};
