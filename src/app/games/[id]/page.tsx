import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { GameDetail } from "@/components/game-detail";
import { getGameDetail } from "@/data/sports-data";
import { getTeam } from "@/lib/seed";

type Props = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";
const loadGame = cache(getGameDetail);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const detail = await loadGame(id);
  if (!detail) return { title: "Matchup not found" };
  return {
    title: `${detail.snapshot.game.awayTeam} at ${detail.snapshot.game.homeTeam}`,
  };
}

export default async function GamePage({ params }: Props) {
  const { id } = await params;
  const detail = await loadGame(id);
  if (!detail) notFound();
  const team = getTeam(detail.snapshot.game.teamSlug);
  if (!team) notFound();
  return <GameDetail data={detail} team={team} />;
}
