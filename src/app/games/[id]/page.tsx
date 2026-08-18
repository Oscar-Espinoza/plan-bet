import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GameDetail } from "@/components/game-detail";
import { getSnapshot, getTeam } from "@/lib/seed";

type Props = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const snapshot = getSnapshot(id);
  if (!snapshot) return { title: "Matchup not found" };
  return { title: `${snapshot.game.awayTeam} at ${snapshot.game.homeTeam}` };
}

export default async function GamePage({ params }: Props) {
  const { id } = await params;
  const snapshot = getSnapshot(id);
  if (!snapshot) notFound();
  const team = getTeam(snapshot.game.teamSlug);
  if (!team) notFound();
  return <GameDetail gameId={id} team={team} />;
}
