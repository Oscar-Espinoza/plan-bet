import type { GameSummary, TeamSlug } from "../server/domain/contracts";

const trackedLogos: Record<TeamSlug, string> = {
  "real-madrid": "/team-logos/real-madrid.svg",
  barcelona: "/team-logos/barcelona.svg",
  "new-york-yankees": "/team-logos/new-york-yankees.svg",
  "boston-red-sox": "/team-logos/boston-red-sox.svg",
};

export function mlbTeamLogoUrl(teamId: number) {
  return `https://www.mlbstatic.com/team-logos/team-primary-on-dark/${teamId}.svg`;
}

/** Crest the board and match links render — provider URLs from the server, bundled SVGs for the four tracked clubs. */
export function gameTeamLogo(game: GameSummary, side: "home" | "away") {
  const slug = side === "home" ? game.homeTeamSlug : game.awayTeamSlug;
  if (slug && trackedLogos[slug]) return trackedLogos[slug];
  const crest =
    side === "home" ? game.homeTeamCrestUrl : game.awayTeamCrestUrl;
  if (crest) return crest;
  return undefined;
}
