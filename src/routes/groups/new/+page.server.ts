import { redirect } from "@sveltejs/kit";
import { requireAccount } from "#lib/server/auth";
import { getTranslation } from "#lib/server/locale";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const { t } = getTranslation({
    cookieLocale: event.locals.locale,
    acceptLanguage: event.request.headers.get("accept-language"),
  });
  const account = requireAccount(event);
  if (!account.ok) {
    if (account.reason === "unconfigured") redirect(303, "/groups");
    redirect(303, "/sign-in?callbackUrl=/groups/new");
  }
  return { title: t("New group") };
};
