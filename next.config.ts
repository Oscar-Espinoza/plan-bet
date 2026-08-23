import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // History and account now live at /you. Next preserves the querystring
  // (sport/outcome/range/scope/page) on a redirect, so existing bookmarks and
  // filtered links keep working without a page that only calls redirect().
  redirects: async () => [
    { source: "/bets", destination: "/you", permanent: true },
    { source: "/account", destination: "/you", permanent: true },
  ],
};

export default nextConfig;
