import { getSystemMetrics } from "#lib/server/data/system-metrics";
import { getTranslation } from "#lib/server/locale";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals }) => {
  const { t } = getTranslation({
    cookieLocale: locals.locale,
    acceptLanguage: null,
  });
  return {
    title: t("System"),
    metrics: getSystemMetrics(),
  };
};
