import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { loadNewsletterDashboardReview } from "@/lib/newsletter/dashboard-review";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireRole("instructor").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const headers = { "Cache-Control": "private, no-store" };
  try {
    return NextResponse.json({ newsletter: await loadNewsletterDashboardReview() }, { headers });
  } catch {
    return NextResponse.json({ error: "Newsletter review status is temporarily unavailable." }, { status: 503, headers });
  }
}
