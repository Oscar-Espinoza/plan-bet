import { randomUUID } from "node:crypto";
import { Dashboard } from "@/components/dashboard";
import { getDashboardData } from "@/data/sports-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await getDashboardData({ requestId: randomUUID() });
  return <Dashboard data={data} />;
}
