/**
 * Custom EQUIP email templates — add/remove, on top of the fixed
 * lifecycle set. Reviewers get read access (same as the gallery page);
 * only admins can create one.
 *
 *   GET  /api/admin/equip/email-templates/custom          → list all
 *   POST /api/admin/equip/email-templates/custom { label, appliesTo,
 *        noteSource, cta, fields } → create, admin-only
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { requireCommitteeOrAdmin } from "@/lib/committees/membership";
import {
  listCustomEquipTemplates,
  createCustomEquipTemplate,
  sanitizeEditableFields,
  type CustomTemplateStream,
} from "@/lib/equip/emails";

export const runtime = "nodejs";

const isStream = (v: unknown): v is CustomTemplateStream => v === "venture_connect" || v === "venture_lift";
const isAppliesTo = (v: unknown): v is "both" | CustomTemplateStream => v === "both" || isStream(v);
const isNoteSource = (v: unknown): v is "reviewer" | "disbursement" | "none" =>
  v === "reviewer" || v === "disbursement" || v === "none";
const isCta = (v: unknown): v is "tracker" | "equip" => v === "tracker" || v === "equip";

export async function GET() {
  const session = await requireCommitteeOrAdmin(["equip_review"], ["equip_grant_reviewer"]).catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const templates = await listCustomEquipTemplates();
  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    label?: unknown; appliesTo?: unknown; noteSource?: unknown; cta?: unknown; fields?: unknown;
  };
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 120) : "";
  if (!label) return NextResponse.json({ error: "Give the template a name." }, { status: 400 });
  if (!isAppliesTo(body.appliesTo)) return NextResponse.json({ error: "Invalid stream." }, { status: 400 });
  const noteSource = isNoteSource(body.noteSource) ? body.noteSource : "none";
  const cta = isCta(body.cta) ? body.cta : "tracker";
  const fields = sanitizeEditableFields(body.fields);
  if (!fields) {
    return NextResponse.json(
      { error: "Invalid fields — subject, heading, and at least one paragraph are required." },
      { status: 400 },
    );
  }

  const tpl = await createCustomEquipTemplate({ label, appliesTo: body.appliesTo, noteSource, cta, fields });
  return NextResponse.json({ ok: true, template: tpl });
}
