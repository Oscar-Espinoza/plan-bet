"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Gauge,
  ListChecks,
  Receipt,
  ServerCog,
  UserCircle,
  UsersRound,
} from "lucide-react";
import { HydrateStore } from "@/components/hydrate-store";
import { getTeamsBySport, teams } from "@/lib/seed";
import { useMatchdayStore } from "@/lib/store";
import type { Sport } from "@/lib/contracts";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: Gauge },
  { href: "/watchlist", label: "Watchlist", icon: ListChecks },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/bets", label: "Bets", icon: Receipt },
  { href: "/groups", label: "Groups", icon: UsersRound },
  { href: "/account", label: "Account", icon: UserCircle },
  { href: "/system", label: "System", icon: ServerCog },
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
  const selectedSport = useMatchdayStore((state) => state.selectedSport);
  const selectedTeamSlug = useMatchdayStore((state) => state.selectedTeamSlug);
  const selectSport = useMatchdayStore((state) => state.selectSport);
  const selectTeam = useMatchdayStore((state) => state.selectTeam);
  const router = useRouter();
  const pathname = usePathname();
  const sportTeams = getTeamsBySport(selectedSport);
  // A game page is pinned to one matchup, so a new selection has nowhere to
  // land there—send it to that team's upcoming games instead.
  const showsSelection = !pathname.startsWith("/games/");

  const handleSport = (sport: Sport) => {
    if (sport === selectedSport) return;
    selectSport(sport);
    if (!showsSelection) router.push("/");
  };

  const handleTeam = (value: string) => {
    const team = teams.find((candidate) => candidate.slug === value);
    if (!team) return;
    selectTeam(team.slug);
    if (!showsSelection) router.push("/");
  };

  return (
    <div className="topbar-controls">
      <div className="sport-toggle" role="group" aria-label="Select sport">
        {(["soccer", "baseball"] as Sport[]).map((sport) => (
          <button
            className={cn(
              "sport-button",
              selectedSport === sport && "sport-button-active",
            )}
            key={sport}
            onClick={() => handleSport(sport)}
            aria-pressed={selectedSport === sport}
          >
            {sport === "soccer" ? "Soccer" : "Baseball"}
          </button>
        ))}
      </div>
      <select
        className="control-select"
        aria-label="Selected team"
        value={selectedTeamSlug}
        onChange={(event) => handleTeam(event.target.value)}
      >
        <optgroup
          label={selectedSport === "soccer" ? "Soccer teams" : "Baseball teams"}
        >
          {sportTeams.map((team) => (
            <option value={team.slug} key={team.slug}>
              {team.name}
            </option>
          ))}
        </optgroup>
        <optgroup
          label={
            selectedSport === "soccer"
              ? "Switch to baseball"
              : "Switch to soccer"
          }
        >
          {teams
            .filter((team) => team.sport !== selectedSport)
            .map((team) => (
              <option value={team.slug} key={team.slug}>
                {team.name}
              </option>
            ))}
        </optgroup>
      </select>
      {accountControl}
    </div>
  );
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
            . <Link href="/rules">Rules</Link>
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
    </div>
  );
}
