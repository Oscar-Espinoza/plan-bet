import "../shared/locale-es";
import { requestLocale, translator } from "../shared/locale";

export function getTranslation({
  cookieLocale,
  acceptLanguage,
}: {
  cookieLocale: string | undefined;
  acceptLanguage: string | null | undefined;
}) {
  return translator(requestLocale(cookieLocale, acceptLanguage));
}
