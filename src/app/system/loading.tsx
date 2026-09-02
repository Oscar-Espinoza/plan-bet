import { Skeleton } from "@/components/ui/skeleton";

export default function SystemLoading() {
  // panelCount must track /system's section count (Provider freshness,
  // Ingestion, Settlement).
  return <Skeleton label="Loading system" variant="record" panelCount={3} />;
}
