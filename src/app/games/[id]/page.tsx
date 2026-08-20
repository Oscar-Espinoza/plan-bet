import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { GameDetail } from "@/components/game-detail";
import { getGameDetail } from "@/data/sports-data";
import { getTeam } from "@/lib/seed";
import { isOpenAiConfigured } from "@/providers/openai/client";

type Props = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";
// Minting requestId inside the cached function (rather than threading it in
// as an argument) keeps the cache key as just `id`, so generateMetadata and
// the page component still share one underlying call.
const loadGame = cache((id: string) =>
  getGameDetail(id, { requestId: randomUUID() }),
);

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
  return (
    <GameDetail data={detail} team={team} aiEnabled={isOpenAiConfigured()} />
  );
}
