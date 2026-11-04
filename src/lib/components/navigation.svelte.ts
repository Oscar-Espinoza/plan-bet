import { getContext, setContext } from "svelte";
import type { MatchView } from "#lib/shared/game-view";

export type PreviewMetadata = {
  match?: Pick<MatchView, "identity" | "timing">;
  groupName?: string;
};

export type Destination = {
  href: string;
  pathname: string;
  metadata?: PreviewMetadata;
};

export type NavigationPreview = {
  readonly pending: Destination | null;
  readonly destination: Destination | null;
  navigate: (
    href: string,
    metadata?: PreviewMetadata,
    options?: { replace?: boolean; scroll?: boolean },
  ) => void;
};

const KEY = Symbol("navigation-preview");

export function provideNavigation(nav: NavigationPreview) {
  setContext(KEY, nav);
}

export function useNavigationPreview(): NavigationPreview | null {
  return getContext<NavigationPreview>(KEY) ?? null;
}
