"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslation } from "@/components/language-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { MatchChrome } from "@/components/matchup/match-chrome";
import { BetSlipSkeleton } from "@/components/matchup/bet-slip-skeleton";
import { StatusRibbon } from "@/components/matchup/status-ribbon";
import type { MatchView } from "@/lib/game-view";

export type PreviewMetadata = {
  match?: Pick<MatchView, "identity" | "timing">;
  groupName?: string;
};
type Destination = {
  href: string;
  pathname: string;
  metadata?: PreviewMetadata;
};

const NavigationContext = createContext<{
  pending: Destination | null;
  destination: Destination | null;
  navigate: (
    href: string,
    metadata?: PreviewMetadata,
    options?: { replace?: boolean; scroll?: boolean },
  ) => void;
} | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [destination, setDestination] = useState<Destination | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const cancel = () => setDestination(null);
    window.addEventListener("popstate", cancel);
    return () => window.removeEventListener("popstate", cancel);
  }, []);

  return (
    <NavigationContext.Provider
      value={{
        destination,
        pending: isPending ? destination : null,
        navigate(href, metadata, options) {
          // Urgent display update; only the actual router work is a transition.
          // Keep one destination in memory, never private data or localStorage.
          const url = new URL(href, window.location.href);
          setDestination({ href, pathname: url.pathname, metadata });
          startTransition(() => {
            if (options?.replace)
              router.replace(href, { scroll: options.scroll });
            else router.push(href, { scroll: options?.scroll });
          });
        },
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigationPreview() {
  return useContext(NavigationContext);
}

/** Shared by the immediate shell preview and Next's streamed loading boundary. */
export function DestinationPreview({
  href,
  metadata,
}: {
  href: string;
  metadata?: PreviewMetadata;
}) {
  const { t } = useTranslation();
  const pathname = href.split(/[?#]/)[0];
  if (pathname.startsWith("/games/")) {
    return (
      <div className="mp" role="status" aria-label={t("Loading game")}>
        <MatchChrome view={metadata?.match} />
        <div className="mp-tab-panel">
          <div className="mp-overview">
            {metadata?.match && (
              <StatusRibbon status={metadata.match.timing.status} />
            )}
            <BetSlipSkeleton
              sport={metadata?.match?.identity.sport}
              finished={metadata?.match?.timing.status === "finished"}
              matchup={
                metadata?.match
                  ? {
                      home: metadata.match.identity.homeTeam,
                      away: metadata.match.identity.awayTeam,
                    }
                  : undefined
              }
            />
            <div className="mp-blocks" aria-hidden="true">
              {[0, 1].map((key) => (
                <section className="mp-block match-context-skeleton" key={key}>
                  <span className="match-placeholder">
                    <span>{t("Match information")}</span>
                  </span>
                  {[0, 1, 2].map((row) => (
                    <div className="match-context-row" key={row}>
                      <span className="match-placeholder">
                        <span>{t("Loading…")}</span>
                      </span>
                      <span className="match-placeholder">
                        <span>00 – 00</span>
                      </span>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }
  const isYou = pathname === "/you";
  const isGroup = pathname.startsWith("/groups/");
  const label =
    pathname === "/"
      ? "Loading games"
      : isYou
        ? "Loading your record"
        : isGroup
          ? "Loading group"
          : pathname === "/groups"
            ? "Loading groups"
            : "Loading…";
  const heading = isYou
    ? "Where you stand"
    : pathname === "/groups"
      ? "Groups"
      : pathname === "/"
        ? "Games"
        : undefined;
  return (
    <div>
      {(heading || metadata?.groupName) && (
        <h1 className="display-title">{metadata?.groupName ?? t(heading!)}</h1>
      )}
      <Skeleton
        label={label}
        variant={isYou || isGroup ? "record" : "list"}
        panelCount={isYou ? 4 : 2}
      />
    </div>
  );
}

export function RouteLoading() {
  const pathname = usePathname();
  const navigation = useNavigationPreview();
  const destination = navigation?.destination;
  return (
    <DestinationPreview
      href={destination?.pathname === pathname ? destination.href : pathname}
      metadata={
        destination?.pathname === pathname ? destination.metadata : undefined
      }
    />
  );
}
