import type { GameSummary, TeamSlug } from "@/lib/contracts";

const trackedLogos: Record<TeamSlug, string> = {
  "real-madrid": "/team-logos/real-madrid.svg",
  barcelona: "/team-logos/barcelona.svg",
  "new-york-yankees": "/team-logos/new-york-yankees.svg",
  "boston-red-sox": "/team-logos/boston-red-sox.svg",
};

export function mlbTeamLogoUrl(teamId: number) {
  return `https://www.mlbstatic.com/team-logos/${teamId}.svg`;
}

export function gameTeamLogo(game: GameSummary, side: "home" | "away") {
  const slug = side === "home" ? game.homeTeamSlug : game.awayTeamSlug;
  // Bundled crests also work for cached games predating provider crest fields.
  if (slug) return trackedLogos[slug];
  return side === "home" ? game.homeTeamCrestUrl : game.awayTeamCrestUrl;
}
