/**
 * One custom EQUIP email template (admin-only).
 *   PATCH  /api/admin/equip/email-templates/custom/[id] { label?, appliesTo?, noteSource?, cta?, fields? } → save
 *   DELETE /api/admin/equip/email-templates/custom/[id]                                                    → remove
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import {
  isCustomTemplateId,
  updateCustomEquipTemplate,
  deleteCustomEquipTemplate,
  sanitizeEditableFields,
  type CustomTemplateStream,
} from "@/lib/equip/emails";

export const runtime = "nodejs";

const isStream = (v: unknown): v is CustomTemplateStream => v === "venture_connect" || v === "venture_lift";
const isAppliesTo = (v: unknown): v is "both" | CustomTemplateStream => v === "both" || isStream(v);
const isNoteSource = (v: unknown): v is "reviewer" | "disbursement" | "none" =>
  v === "reviewer" || v === "disbursement" || v === "none";
const isCta = (v: unknown): v is "tracker" | "equip" => v === "tracker" || v === "equip";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  if (!isCustomTemplateId(id)) return NextResponse.json({ error: "Unknown template." }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as {
    label?: unknown; appliesTo?: unknown; noteSource?: unknown; cta?: unknown; fields?: unknown;
  };
  const patch: Parameters<typeof updateCustomEquipTemplate>[1] = {};
  if (body.label !== undefined) {
    const label = typeof body.label === "string" ? body.label.trim().slice(0, 120) : "";
    if (!label) return NextResponse.json({ error: "Give the template a name." }, { status: 400 });
    patch.label = label;
  }
  if (body.appliesTo !== undefined) {
    if (!isAppliesTo(body.appliesTo)) return NextResponse.json({ error: "Invalid stream." }, { status: 400 });
    patch.appliesTo = body.appliesTo;
  }
  if (body.noteSource !== undefined) {
    if (!isNoteSource(body.noteSource)) return NextResponse.json({ error: "Invalid note source." }, { status: 400 });
    patch.noteSource = body.noteSource;
  }
  if (body.cta !== undefined) {
    if (!isCta(body.cta)) return NextResponse.json({ error: "Invalid CTA target." }, { status: 400 });
    patch.cta = body.cta;
  }
  if (body.fields !== undefined) {
    const fields = sanitizeEditableFields(body.fields);
    if (!fields) {
      return NextResponse.json(
        { error: "Invalid fields — subject, heading, and at least one paragraph are required." },
        { status: 400 },
      );
    }
    patch.fields = fields;
  }

  const tpl = await updateCustomEquipTemplate(id, patch);
  if (!tpl) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, template: tpl });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  if (!isCustomTemplateId(id)) return NextResponse.json({ error: "Unknown template." }, { status: 400 });

  const removed = await deleteCustomEquipTemplate(id);
  if (!removed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
