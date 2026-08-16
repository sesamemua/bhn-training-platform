/**
 * Robots policy, computed per deployment.
 *
 * The portfolio demo must never be indexed — recruiters get the link
 * directly, and a crawled demo full of synthetic people would pollute
 * search results for the real platform. Production keeps its previous
 * behaviour (no robots.txt existed, i.e. everything allowed) minus the
 * obvious non-pages.
 */
import type { MetadataRoute } from "next";
import { demoMode } from "@/lib/demo/mode";

export default function robots(): MetadataRoute.Robots {
  if (demoMode()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/sandbox/"] },
  };
}
