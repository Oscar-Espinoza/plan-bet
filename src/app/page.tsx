import { headers } from "next/headers";
import { z } from "zod";
import { Slate } from "@/components/slate";
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
  const data = await getCachedDashboardData();
  // Vercel supplies the viewer's timezone; anywhere else (local dev,
  // Playwright) falls back to UTC, which is also what makes the e2e board
  // deterministic.
  const tz = (await headers()).get("x-vercel-ip-timezone") ?? "UTC";
  return <Slate data={data} sport={sport} tz={tz} />;
}
