import { headers } from "next/headers";
import { z } from "zod";
import { Slate, type BoardData } from "@/components/slate";
import { StadiumPreload } from "@/components/stadium-preload";
import { getCachedDashboardData } from "@/data/sports-data";

export const dynamic = "force-dynamic";
export const unstable_dynamicStaleTime = 30;

const sportFilterSchema = z.enum(["all", "soccer", "baseball"]).catch("all");

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: Props) {
  const params = await searchParams;
  const sport = sportFilterSchema.parse(params.sport);
  const dashboard = await getCachedDashboardData();
  // The board never reads a team's sport context; leaving it out keeps it off
  // the RSC payload the client has to parse.
  const data = Object.fromEntries(
    Object.entries(dashboard).map(([slug, { team, games, freshness }]) => [
      slug,
      { team, games, freshness },
    ]),
  ) as BoardData;
  // Vercel supplies the viewer's timezone; anywhere else (local dev,
  // Playwright) falls back to UTC, which is also what makes the e2e board
  // deterministic.
  const tz = (await headers()).get("x-vercel-ip-timezone") ?? "UTC";
  return (
    <>
      <StadiumPreload />
      <Slate data={data} sport={sport} tz={tz} />
    </>
  );
}
