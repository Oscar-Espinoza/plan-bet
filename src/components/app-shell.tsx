"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Activity, Gauge, ListChecks, RotateCcw } from "lucide-react";
import { HydrateStore } from "@/components/hydrate-store";
import { Button } from "@/components/ui/button";
import { getTeamsBySport, teams } from "@/lib/seed";
import { useMatchdayStore } from "@/lib/store";
import type { Sport } from "@/lib/contracts";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: Gauge },
  { href: "/watchlist", label: "Watchlist", icon: ListChecks },
  { href: "/activity", label: "Activity", icon: Activity },
];

function isCurrent(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/games/");
  return pathname.startsWith(href);
}

function WorkspaceControls() {
  const selectedSport = useMatchdayStore((state) => state.selectedSport);
  const selectedTeamSlug = useMatchdayStore((state) => state.selectedTeamSlug);
  const selectSport = useMatchdayStore((state) => state.selectSport);
  const selectTeam = useMatchdayStore((state) => state.selectTeam);
  const resetDemo = useMatchdayStore((state) => state.resetDemo);
  const router = useRouter();
  const sportTeams = getTeamsBySport(selectedSport);

  const handleTeam = (value: string) => {
    const team = teams.find((candidate) => candidate.slug === value);
    if (team) selectTeam(team.slug);
  };

  const handleReset = () => {
    resetDemo();
    router.push("/");
  };

  return (
    <div className="topbar-controls">
      <div className="sport-toggle" aria-label="Select sport">
        {(["soccer", "baseball"] as Sport[]).map((sport) => (
          <button
            className={cn(
              "sport-button",
              selectedSport === sport && "sport-button-active",
            )}
            key={sport}
            onClick={() => selectSport(sport)}
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
      <AlertDialog.Root>
        <AlertDialog.Trigger asChild>
          <Button variant="ghost" size="icon" aria-label="Reset demo">
            <RotateCcw aria-hidden="true" size={16} />
          </Button>
        </AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="alert-overlay" />
          <AlertDialog.Content className="alert-content">
            <AlertDialog.Title className="alert-title">
              Reset this demo?
            </AlertDialog.Title>
            <AlertDialog.Description className="alert-description">
              This clears Matchday Plan selections, watchlist items, recaps, and
              activity from this browser. Other local storage is left untouched.
            </AlertDialog.Description>
            <div className="alert-actions">
              <AlertDialog.Cancel asChild>
                <Button variant="secondary">Cancel</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button variant="danger" onClick={handleReset}>
                  Reset demo
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="app-shell">
      <HydrateStore />
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside className="sidebar" aria-label="Primary navigation">
        <Link href="/" className="brand" aria-label="Matchday Plan home">
          <span className="brand-mark">MP</span>
          <span>
            <span className="brand-name">Matchday Plan</span>
            <span className="brand-subtitle">Game prep desk</span>
          </span>
        </Link>
        <nav className="nav-list">
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
        <div className="sidebar-foot">
          <span className="eyebrow">Session 01</span>
          <p>
            Local-first portfolio preview. All sports data is an explicit demo
            snapshot.
          </p>
        </div>
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
            <WorkspaceControls />
          </div>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}>
          {children}
        </main>
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
