import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/components/shop/seo";

/** Private and transactional areas stay out of crawlers; the sitemap lists everything worth indexing. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/account", "/admin", "/checkout", "/orders", "/cart", "/saved", "/shop-filtered", "/api/"] }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
