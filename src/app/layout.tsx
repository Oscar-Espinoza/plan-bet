import type { Metadata, Viewport } from "next";
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
    "A no-login planning workspace for upcoming Real Madrid, Barcelona, Yankees, and Red Sox games: source-backed context, cited briefings, and a browser-local watchlist. Not a sportsbook.",
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
    description: "A no-login sports preparation workspace. Not a sportsbook.",
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
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
