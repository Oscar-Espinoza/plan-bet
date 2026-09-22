"use client";

import { LanguageSwitch, useTranslation } from "@/components/language-provider";
import type { Message } from "@/lib/locale";
import { useLayoutEffect, useRef } from "react";
import { NavigationLink as Link } from "@/components/fast-link";
import {
  NavigationProvider,
  DestinationPreview,
  useNavigationPreview,
} from "@/components/navigation-preview";
import { LocalLink } from "@/components/fast-link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  UsersRound,
  CircleDot,
  Trophy,
  UserRound,
} from "lucide-react";
import { Buddy } from "@/components/buddy-launcher";
import { HydrateStore } from "@/components/hydrate-store";
import { TourBar } from "@/components/tour-bar";
import { cn } from "@/lib/utils";

// Both layouts share destinations and active states.
const navItems = [
  { href: "/", label: "Games", icon: CircleDot, section: undefined },
  {
    href: "/you?section=bets#you-history-heading",
    label: "My Bets",
    icon: Trophy,
    section: "bets",
  },
  {
    href: "/groups",
    label: "Groups",
    icon: UsersRound,
    section: undefined,
  },
  {
    href: "/you?section=profile#you-settings-heading",
    label: "Profile",
    icon: UserRound,
    section: "profile",
  },
];

function isCurrent(
  pathname: string,
  href: string,
  section?: string,
  activeSection?: string,
) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/games/");
  if (href === "/groups")
    return pathname === "/groups" || pathname.startsWith("/groups/");
  return pathname === "/you" && section === activeSection;
}

export function AppShell({
  children,
  accountControl,
}: {
  children: React.ReactNode;
  accountControl?: React.ReactNode;
}) {
  return (
    <NavigationProvider>
      <ShellContent accountControl={accountControl}>{children}</ShellContent>
    </NavigationProvider>
  );
}

function ShellContent({
  children,
  accountControl,
}: {
  children: React.ReactNode;
  accountControl?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const committedPathname = usePathname();
  const navigation = useNavigationPreview();
  const pending = navigation?.pending;
  const pathname = pending?.pathname ?? committedPathname;
  const searchParams = useSearchParams();
  const scroller = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!pending || !scroller.current) return;
    const element = scroller.current;
    const previousTop = element.scrollTop;
    element.scrollTop = 0;
    // A cancelled navigation restores the old page at its original position.
    return () => {
      element.scrollTop = previousTop;
    };
  }, [pending]);
  // The bar exists on a game page and nowhere else: it is the wager action,
  // not shell furniture. The board deliberately ends at the nav.
  const onGame = pathname.startsWith("/games/");
  const activeSection =
    (pending
      ? new URL(pending.href, "http://local").searchParams
      : searchParams
    ).get("section") ?? "profile";
  const showUtilityChrome = !pending && pathname !== "/" && !onGame;

  return (
    <div className="app-shell">
      <HydrateStore />
      <a className="skip-link" href="#main-content">
        {t("Skip to main content")}
      </a>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-inner">
            {onGame && (
              <Link href="/" className="shell-back">
                <ArrowLeft aria-hidden="true" size={24} />
                <span className="sr-only">{t("Back to games")}</span>
              </Link>
            )}
            <Link
              prefetch={false}
              href="/"
              className="brand"
              aria-label={t("Matchday Plan home")}
            >
              <span className="brand-mark">MP</span>
              <span className="brand-name">Matchday Plan</span>
            </Link>
            <nav className="topbar-nav" aria-label={t("Primary navigation")}>
              {navItems.map((item) => {
                const active = isCurrent(
                  pathname,
                  item.href,
                  item.section,
                  activeSection,
                );
                return (
                  <LocalLink
                    className={cn("nav-link", active && "nav-link-active")}
                    href={item.href}
                    key={item.href}
                    aria-current={active ? "page" : undefined}
                  >
                    <item.icon aria-hidden="true" size={17} />
                    {t(item.label as Message)}
                  </LocalLink>
                );
              })}
            </nav>
            <div className="topbar-controls">
              {accountControl}
              <LanguageSwitch />
            </div>
          </div>
        </header>
        <div
          className="workspace-scroll"
          key={committedPathname}
          ref={scroller}
        >
          <main id="main-content" className="main-content" tabIndex={-1}>
            {pending && (
              <div
                className="navigation-preview"
                data-navigation-preview={pending.pathname}
                key={pending.href}
              >
                <DestinationPreview
                  href={pending.href}
                  metadata={pending.metadata}
                />
              </div>
            )}
            <div
              className="route-content"
              hidden={Boolean(pending)}
              inert={Boolean(pending)}
            >
              {children}
            </div>
          </main>
          <footer className="app-footer">
            <p className="fine-print">
              {t("Source data:")}{" "}
              <a
                href="https://www.football-data.org/"
                target="_blank"
                rel="noreferrer"
              >
                football-data.org
              </a>
              ,{" "}
              <a
                href="https://statsapi.mlb.com/"
                target="_blank"
                rel="noreferrer"
              >
                MLB Stats API
              </a>
              {t(", and")}{" "}
              <a
                href="https://baseballsavant.mlb.com/"
                target="_blank"
                rel="noreferrer"
              >
                Baseball Savant
              </a>
              . <Link href="/rules">{t("Rules")}</Link> ·{" "}
              <Link href="/system">{t("System")}</Link>
            </p>
            <p className="fine-print">
              {t(
                "Credits are fictional and non-withdrawable. Not a sportsbook.",
              )}
            </p>
          </footer>
        </div>
      </div>
      <nav className="mobile-nav" aria-label={t("Mobile navigation")}>
        {navItems.map((item) => {
          const active = isCurrent(
            pathname,
            item.href,
            item.section,
            activeSection,
          );
          return (
            <LocalLink
              className={cn(
                "mobile-nav-link",
                active && "mobile-nav-link-active",
              )}
              href={item.href}
              key={item.href}
              aria-current={active ? "page" : undefined}
            >
              <item.icon aria-hidden="true" size={18} />
              {t(item.label as Message)}
            </LocalLink>
          );
        })}
      </nav>
      {showUtilityChrome && <TourBar />}
      {showUtilityChrome && <Buddy />}
    </div>
  );
}
