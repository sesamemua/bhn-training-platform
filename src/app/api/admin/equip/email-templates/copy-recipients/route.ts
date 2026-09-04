/**
 * Internal copy recipients for EQUIP submission confirmations — who gets
 * silently BCC'd (with the PDF packet attached) when an applicant
 * submits. One list per stream that actually has a packet builder
 * (VentureConnect, Innovation Fellowship); VentureLift has none yet.
 *
 *   GET   /api/admin/equip/email-templates/copy-recipients            → current lists
 *   PATCH /api/admin/equip/email-templates/copy-recipients { stream, emails } → save one list, admin-only
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { requireCommitteeOrAdmin } from "@/lib/committees/membership";
import { getEquipCopyRecipients, saveEquipCopyRecipients } from "@/lib/equip/emails";

export const runtime = "nodejs";

const isStream = (v: unknown): v is "venture_connect" | "innovation_fellowship" =>
  v === "venture_connect" || v === "innovation_fellowship";

export async function GET() {
  const session = await requireCommitteeOrAdmin(["equip_review"], ["equip_grant_reviewer"]).catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const recipients = await getEquipCopyRecipients();
  return NextResponse.json({ recipients });
}

export async function PATCH(req: NextRequest) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { stream?: unknown; emails?: unknown };
  if (!isStream(body.stream)) return NextResponse.json({ error: "Invalid stream." }, { status: 400 });

  const recipients = await saveEquipCopyRecipients(body.stream, body.emails);
  return NextResponse.json({ ok: true, recipients });
}
