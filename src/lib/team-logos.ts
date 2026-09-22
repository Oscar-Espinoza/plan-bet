import type { GameSummary, TeamSlug } from "@/lib/contracts";
import catalog from "./team-badge-catalog.json";

function badgeKey(name: string) {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\b(fc|cf)\b/g, "").replace(/[^a-z0-9]/g, "");
}

const trackedLogos: Record<TeamSlug, string> = {
  "real-madrid": "/team-logos/real-madrid.svg",
  barcelona: "/team-logos/barcelona.svg",
  "new-york-yankees": "/team-logos/new-york-yankees.svg",
  "boston-red-sox": "/team-logos/boston-red-sox.svg",
};

export function mlbTeamLogoUrl(teamId: number) {
  return `https://www.mlbstatic.com/team-logos/team-primary-on-dark/${teamId}.svg`;
}

export function gameTeamLogo(game: GameSummary, side: "home" | "away") {
  const name = side === "home" ? game.homeTeam : game.awayTeam;
  const key = badgeKey(name);
  if (game.sport === "baseball") {
    const id = (catalog.baseball as Record<string, number>)[key];
    if (id) return mlbTeamLogoUrl(id);
  } else {
    const badge = (catalog.football as Record<string, string>)[key];
    if (badge) return badge;
  }
  const slug = side === "home" ? game.homeTeamSlug : game.awayTeamSlug;
  // Bundled crests also work for cached games predating provider crest fields.
  if (slug) return trackedLogos[slug];
  return side === "home" ? game.homeTeamCrestUrl : game.awayTeamCrestUrl;
}
