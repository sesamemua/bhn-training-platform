/**
 * Render a custom EQUIP template from UNSAVED fields (admin-only).
 *   POST { stream, noteSource, cta, fields } → { subject, html }
 * Same idea as the built-in preview route, but for a template that may
 * not exist yet — behaviour comes straight from the request instead of
 * a stored template id.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { renderWithBehaviour, sanitizeEditableFields, sampleEquipCtx } from "@/lib/equip/emails";
import type { EquipStream } from "@/lib/equip/types";

export const runtime = "nodejs";

const isStream = (v: unknown): v is EquipStream => v === "venture_connect" || v === "venture_lift";
const isNoteSource = (v: unknown): v is "reviewer" | "disbursement" | "none" =>
  v === "reviewer" || v === "disbursement" || v === "none";
const isCta = (v: unknown): v is "tracker" | "equip" => v === "tracker" || v === "equip";

export async function POST(req: NextRequest) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    stream?: unknown; noteSource?: unknown; cta?: unknown; fields?: unknown;
  };
  if (!isStream(body.stream)) return NextResponse.json({ error: "Invalid stream." }, { status: 400 });
  const fields = sanitizeEditableFields(body.fields);
  if (!fields) {
    return NextResponse.json(
      { error: "Invalid fields — subject, heading, and at least one paragraph are required." },
      { status: 400 },
    );
  }
  const noteSource = isNoteSource(body.noteSource) ? body.noteSource : "none";
  const cta = isCta(body.cta) ? body.cta : "tracker";

  const built = renderWithBehaviour(sampleEquipCtx(body.stream), fields, {
    note: noteSource === "none" ? null : noteSource,
    cta,
  });
  return NextResponse.json({ ok: true, subject: built.subject, html: built.html });
}
