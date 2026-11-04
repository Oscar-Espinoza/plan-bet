import { redirect } from "@sveltejs/kit";
import { safeCallbackUrl } from "#lib/server/api-request";
import {
  configuredProviderNames,
  isAuthConfigured,
  requireAccount,
} from "#lib/server/auth";
import { getTranslation } from "#lib/server/locale";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const { t } = getTranslation({
    cookieLocale: event.locals.locale,
    acceptLanguage: event.request.headers.get("accept-language"),
  });
  const callbackUrl = safeCallbackUrl(
    event.url.searchParams.get("callbackUrl") ?? undefined,
  );
  const error = event.url.searchParams.get("error") ?? undefined;

  const account = requireAccount(event);
  if (account.ok) redirect(303, callbackUrl);

  return {
    authConfigured: isAuthConfigured(),
    providers: configuredProviderNames(),
    callbackUrl,
    error,
    title: t("Sign in"),
  };
};
