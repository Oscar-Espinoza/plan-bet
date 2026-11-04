import { env } from "cloudflare:workers";
import { appBaseUrl } from "#lib/server/email";
import { isAuthConfigured, requireAccount } from "#lib/server/auth";
import { loadAccountChipMetrics } from "#lib/server/data/credits";
import { getTranslation } from "#lib/server/locale";
import { MAINTENANCE_MESSAGE } from "#lib/server/maintenance";
import spanish from "#lib/shared/messages.es.json";
import type { LayoutServerLoad } from "./$types";

const DESCRIPTION =
  "Practice your calls on real upcoming Real Madrid, Barcelona, Yankees, and Red Sox fixtures: source-backed context, an AI buddy that reads the same facts, and a free-to-play bet simulator on fictional credits. Browsing needs no account. Not a sportsbook.";
const OG_DESCRIPTION =
  "Real fixtures. Your call. Practice on fictional credits with source-backed context.";
const TWITTER_DESCRIPTION =
  "A sports preparation workspace. Browsing needs no account. Not a sportsbook.";

function siteUrl(): string {
  try {
    const configured = env.PUBLIC_SITE_URL?.trim();
    if (configured && !configured.includes("<"))
      return configured.replace(/\/+$/, "");
  } catch {
    // cloudflare:workers env is only present inside the worker.
  }
  const base = appBaseUrl();
  return base.includes("<") ? "http://localhost:8787" : base;
}

export const load: LayoutServerLoad = async (event) => {
  const { t } = getTranslation({
    cookieLocale: event.locals.locale,
    acceptLanguage: event.request.headers.get("accept-language"),
  });

  const authConfigured = isAuthConfigured();
  const account = requireAccount(event);
  let accountChip:
    | {
        signedIn: true;
        balance: number;
        won: number;
        lost: number;
        openCount: number;
      }
    | { signedIn: false } = { signedIn: false };

  if (account.ok) {
    const metrics = await loadAccountChipMetrics(account.userId);
    accountChip = { signedIn: true, ...metrics };
  }

  return {
    locale: event.locals.locale,
    zone: event.locals.zone,
    requestTime: event.locals.requestTime,
    siteUrl: siteUrl(),
    spanish: event.locals.locale === "es" ? spanish : null,
    title: t("Matchday Plan — Practice your calls"),
    description: t(DESCRIPTION),
    ogDescription: t(OG_DESCRIPTION),
    twitterDescription: t(TWITTER_DESCRIPTION),
    maintenance: event.locals.maintenance,
    maintenanceMessage: t(MAINTENANCE_MESSAGE),
    account: {
      authConfigured,
      ...accountChip,
    },
  };
};
