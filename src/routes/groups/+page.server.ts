import { redirect } from "@sveltejs/kit";
import { requireAccount } from "#lib/server/auth";
import { listGroupsForUser } from "#lib/server/data/groups-repository";
import { getTranslation } from "#lib/server/locale";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const { t } = getTranslation({
    cookieLocale: event.locals.locale,
    acceptLanguage: event.request.headers.get("accept-language"),
  });
  const title = t("Groups");
  const account = requireAccount(event);
  if (!account.ok && account.reason === "unconfigured") {
    return { status: "unconfigured" as const, title };
  }
  if (!account.ok) redirect(303, "/sign-in?callbackUrl=/groups");

  const groups = await listGroupsForUser(account.userId);
  return {
    status: "ready" as const,
    title,
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      slug: group.slug,
      role: group.role,
    })),
  };
};
