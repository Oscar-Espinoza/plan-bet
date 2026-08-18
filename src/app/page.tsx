import { Dashboard } from "@/components/dashboard";
import { getDashboardData } from "@/data/sports-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await getDashboardData();
  return <Dashboard data={data} />;
}
