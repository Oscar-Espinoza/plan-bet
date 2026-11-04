import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Operational and machine endpoints are uncacheable and uninteresting to
      // crawlers; the product routes are the ones worth indexing.
      { userAgent: "*", allow: "/", disallow: ["/api/", "/system"] },
    ],
  };
}
