/**
 * GET /api/admin/marketing-metrics — LinkedIn page and biohubnet.ca
 * numbers for the admin dashboard. Admin only.
 *
 * No `dynamic = "force-dynamic"` here on purpose: it would turn off the
 * 30-minute cache on the LinkedIn requests, and the dashboard would ask
 * LinkedIn every few minutes. The route is dynamic anyway (it reads the
 * session).
 */
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { linkedinSnapshot } from "@/lib/metrics/linkedin";
import { siteMetrics } from "@/lib/metrics/ga4";
import { loadSocialDashboard } from "@/lib/social/dashboard-server";
import { buildSocialBrief } from "@/lib/social/dashboard";

export async function GET() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const now = new Date();
  const [linkedin, site, queue] = await Promise.all([linkedinSnapshot(), siteMetrics(), loadSocialDashboard(now).catch(() => {
    console.warn("[metrics] Social queue could not be read.");
    return null;
  })]);
  return NextResponse.json({ at: now.toISOString(), linkedin, site, social: buildSocialBrief(queue, linkedin, now) });
}
