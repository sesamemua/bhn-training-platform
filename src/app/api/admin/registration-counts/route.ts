/**
 * GET /api/admin/registration-counts — registration totals for Industry
 * Insights, the Annual Symposium and Training Week, read live. Admin only;
 * the dashboard card polls it.
 */
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { registrationCounts } from "@/lib/events/registrations";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await registrationCounts());
}
