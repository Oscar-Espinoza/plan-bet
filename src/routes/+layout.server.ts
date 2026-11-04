import { env } from "cloudflare:workers";
import { appBaseUrl } from "#lib/server/email";
import { getTranslation } from "#lib/server/locale";
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

export const load: LayoutServerLoad = ({ locals }) => {
  const { t } = getTranslation({
    cookieLocale: locals.locale,
    acceptLanguage: null,
  });
  return {
    locale: locals.locale,
    zone: locals.zone,
    requestTime: locals.requestTime,
    siteUrl: siteUrl(),
    spanish: locals.locale === "es" ? spanish : null,
    title: t("Matchday Plan — Practice your calls"),
    description: t(DESCRIPTION),
    ogDescription: t(OG_DESCRIPTION),
    twitterDescription: t(TWITTER_DESCRIPTION),
  };
};
