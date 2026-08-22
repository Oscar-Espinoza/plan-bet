import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { AccountControl } from "@/components/account-control";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Matchday Plan — Sports prep workspace",
    template: "%s · Matchday Plan",
  },
  description:
    "Practice your calls on real upcoming Real Madrid, Barcelona, Yankees, and Red Sox fixtures: source-backed context, cited briefings, and a free-to-play wager simulator on fictional credits. Browsing needs no account. Not a sportsbook.",
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
      "Turn the next fixture into a clear, evidence-linked preparation plan.",
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

export const viewport: Viewport = {
  themeColor: "#090d12",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {/* The chip awaits a session lookup plus two ledger aggregates. Left
            unsuspended in the root layout it blocks the whole shell from
            flushing on every route. fallback={null} is what the component
            itself renders when sign-in is unconfigured, so nothing shifts. */}
        <AppShell
          accountControl={
            <Suspense fallback={null}>
              <AccountControl />
            </Suspense>
          }
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
