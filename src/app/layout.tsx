import { getTranslation } from "@/lib/locale-server";
import { cookies, headers } from "next/headers";
import { parseLocale } from "@/lib/locale";
import { LanguageProvider } from "@/components/language-provider";
import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { AccountControl } from "@/components/account-control";
import { RefreshVisiblePage } from "@/components/refresh-visible-page";
import { AppShell } from "@/components/app-shell";
import { RequestClockProvider } from "@/components/local-date-time";
import { archivo, dmMono, plexSans } from "./fonts";
import "./globals.css";
import "./games/[id]/matchup.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Matchday Plan — Practice your calls",
    template: "%s · Matchday Plan",
  },
  description:
    "Practice your calls on real upcoming Real Madrid, Barcelona, Yankees, and Red Sox fixtures: source-backed context, an AI buddy that reads the same facts, and a free-to-play bet simulator on fictional credits. Browsing needs no account. Not a sportsbook.",
  applicationName: "Matchday Plan",
  authors: [{ name: "Matchday Plan" }],
  keywords: ["sports", "matchday", "soccer", "baseball", "portfolio"],
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  openGraph: {
    title: "Matchday Plan",
    description:
      "Real fixtures. Your call. Practice on fictional credits with source-backed context.",
    siteName: "Matchday Plan",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Matchday Plan sports preparation workspace",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Matchday Plan",
    description:
      "A sports preparation workspace. Browsing needs no account. Not a sportsbook.",
    images: [
      {
        url: "/opengraph-image",
        alt: "Matchday Plan sports preparation workspace",
      },
    ],
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslation();
  return {
    ...metadata,
    title: {
      default: t("Matchday Plan — Practice your calls"),
      template: "%s · Matchday Plan",
    },
    description: t(metadata.description ?? ""),
    openGraph: {
      ...metadata.openGraph,
      description: t(
        "Real fixtures. Your call. Practice on fictional credits with source-backed context.",
      ),
    },
    twitter: {
      ...metadata.twitter,
      description: t(
        "A sports preparation workspace. Browsing needs no account. Not a sportsbook.",
      ),
    },
  };
}

export const viewport: Viewport = {
  // Must track --ink.
  themeColor: "#07111a",
  colorScheme: "dark",
  // Lets env(safe-area-inset-*) resolve on phones with a notch or home
  // indicator; the nav pads itself by it and useBandHeight measures the result.
  viewportFit: "cover",
};

/** The request's own time — what the first paint's relative labels count from. */
const requestTime = () => Date.now();

/** Vercel's geolocated zone, if it is one Intl accepts; UTC otherwise. */
function viewerZone(value: string | null) {
  if (!value) return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return value;
  } catch {
    return "UTC";
  }
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = parseLocale((await cookies()).get("locale")?.value);
  const zone = viewerZone((await headers()).get("x-vercel-ip-timezone"));
  return (
    <html
      lang={locale}
      data-scroll-behavior="smooth"
      className={`${archivo.variable} ${plexSans.variable} ${dmMono.variable}`}
    >
      <head>
        {/* Opponent crests for baseball come from MLB's asset host. */}
        <link rel="preconnect" href="https://www.mlbstatic.com" />
      </head>
      <body>
        <LanguageProvider locale={locale}>
          <RequestClockProvider zone={zone} now={requestTime()}>
            {/* The chip awaits a session lookup plus two ledger aggregates. Left
            unsuspended in the root layout it blocks the whole shell from
            flushing on every route. fallback={null} is what the component
            itself renders when sign-in is unconfigured, so nothing shifts. */}
            <Suspense fallback={null}>
              <AppShell
                accountControl={
                  <Suspense fallback={null}>
                    <AccountControl />
                  </Suspense>
                }
              >
                <RefreshVisiblePage />
                {children}
              </AppShell>
            </Suspense>
          </RequestClockProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
