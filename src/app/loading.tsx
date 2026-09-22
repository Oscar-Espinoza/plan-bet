import { getTranslation } from "@/lib/locale-server";
import { Skeleton } from "@/components/ui/skeleton";

export default async function SlateLoading() {
  const { t } = await getTranslation();
  return <Skeleton label={t("Loading games")} variant="list" />;
}
