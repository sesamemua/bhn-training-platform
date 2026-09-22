/**
 * GET /api/admin/registration-counts — registration totals for Industry
 * Insights, the Annual Symposium and Training Week, read live. Admin only;
 * the dashboard card polls it.
 */
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { registrationCounts } from "@/lib/events/registrations";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // The poll takes what is held; Refresh asks for a fresh read, which
  // the holder still rations so a held-down button cannot become a poll.
  const force = new URL(req.url).searchParams.get("force") === "1";
  return NextResponse.json(await registrationCounts(force));
}
