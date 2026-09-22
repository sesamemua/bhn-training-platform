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

export async function GET() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [linkedin, site] = await Promise.all([linkedinSnapshot(), siteMetrics()]);
  return NextResponse.json({ at: new Date().toISOString(), linkedin, site });
}
