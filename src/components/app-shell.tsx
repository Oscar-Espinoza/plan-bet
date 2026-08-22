"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gauge, UserCircle, UsersRound } from "lucide-react";
import { HydrateStore } from "@/components/hydrate-store";
import { TourBar } from "@/components/tour-bar";
import { cn } from "@/lib/utils";

// Seven flat items read as equally weighted and gave System — ops telemetry —
// the same billing as the games board. Three items, one destination each:
// the slate, where you stand, and the group lens on it. System moves to the
// footer, beside Rules.
const navItems = [
  { href: "/", label: "Games", icon: Gauge },
  { href: "/you", label: "You", icon: UserCircle },
  { href: "/groups", label: "Groups", icon: UsersRound },
];

function isCurrent(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/games/");
  return pathname.startsWith(href);
}

function WorkspaceControls({
  accountControl,
}: {
  accountControl?: React.ReactNode;
}) {
  return <div className="topbar-controls">{accountControl}</div>;
}

export function AppShell({
  children,
  accountControl,
}: {
  children: React.ReactNode;
  accountControl?: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="app-shell">
      <HydrateStore />
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside className="sidebar" aria-label="Site sidebar">
        <Link href="/" className="brand" aria-label="Matchday Plan home">
          <span className="brand-mark">MP</span>
          <span>
            <span className="brand-name">Matchday Plan</span>
            <span className="brand-subtitle">Game prep desk</span>
          </span>
        </Link>
        <nav className="nav-list" aria-label="Primary navigation">
          {navItems.map((item) => {
            const active = isCurrent(pathname, item.href);
            return (
              <Link
                className={cn("nav-link", active && "nav-link-active")}
                href={item.href}
                key={item.href}
                aria-current={active ? "page" : undefined}
              >
                <item.icon aria-hidden="true" size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-inner">
            <Link
              href="/"
              className="mobile-brand"
              aria-label="Matchday Plan home"
            >
              <span className="brand-mark">MP</span>
              <span>Matchday Plan</span>
            </Link>
            <WorkspaceControls accountControl={accountControl} />
          </div>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}>
          {children}
        </main>
        <footer className="app-footer">
          <p className="fine-print">
            Source data:{" "}
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
            , and{" "}
            <a
              href="https://baseballsavant.mlb.com/"
              target="_blank"
              rel="noreferrer"
            >
              Baseball Savant
            </a>
            . <Link href="/rules">Rules</Link> ·{" "}
            <Link href="/system">System</Link>
          </p>
          <p className="fine-print">
            Credits are fictional and non-withdrawable. Not a sportsbook.
          </p>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navItems.map((item) => {
          const active = isCurrent(pathname, item.href);
          return (
            <Link
              className={cn(
                "mobile-nav-link",
                active && "mobile-nav-link-active",
              )}
              href={item.href}
              key={item.href}
              aria-current={active ? "page" : undefined}
            >
              <item.icon aria-hidden="true" size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <TourBar />
    </div>
  );
}
