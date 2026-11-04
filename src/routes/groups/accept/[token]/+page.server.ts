import { redirect } from "@sveltejs/kit";
import { requireAccount } from "#lib/server/auth";
import {
  isGroupMember,
  previewInvite,
} from "#lib/server/data/groups-repository";
import { getTranslation } from "#lib/server/locale";
import type { PageServerLoad } from "./$types";

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now();
}

export const load: PageServerLoad = async (event) => {
  const { t } = getTranslation({
    cookieLocale: event.locals.locale,
    acceptLanguage: event.request.headers.get("accept-language"),
  });
  const title = t("Accept invite");
  const token = event.params.token;
  const account = requireAccount(event);
  if (!account.ok) {
    if (account.reason === "unconfigured") {
      return { title, kind: "unconfigured" as const };
    }
    redirect(303, `/sign-in?callbackUrl=/groups/accept/${token}`);
  }

  const preview = await previewInvite(token);
  if (!preview) return { title, kind: "missing" as const };
  if (await isGroupMember(preview.groupId, account.userId)) {
    return {
      title,
      kind: "already" as const,
      groupName: preview.groupName,
      groupSlug: preview.groupSlug,
    };
  }
  if (preview.status === "revoked") return { title, kind: "revoked" as const };
  if (preview.status === "accepted") return { title, kind: "used" as const };
  if (preview.status === "expired" || isExpired(preview.expiresAt)) {
    return { title, kind: "expired" as const };
  }
  return {
    title,
    kind: "ready" as const,
    token,
    groupName: preview.groupName,
    invitedByName: preview.invitedByName,
  };
};
