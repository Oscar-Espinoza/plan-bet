import { getTranslation } from "@/lib/locale-server";
import { Skeleton } from "@/components/ui/skeleton";

export default async function SystemLoading() {
  const { t } = await getTranslation();
  // panelCount must track /system's section count (Provider freshness,
  // Ingestion, Settlement).
  return (
    <Skeleton label={t("Loading system")} variant="record" panelCount={3} />
  );
}
