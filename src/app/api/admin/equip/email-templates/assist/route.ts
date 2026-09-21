/**
 * AI-assisted template editing (admin-only).
 *   POST /api/admin/equip/email-templates/assist
 *     { id, stream, instruction, fields }
 *   → { fields, subject, html } — a PROPOSED rewrite (never auto-saved; the
 *     admin reviews the live preview and explicitly saves).
 *
 * Uses the platform AI helper (Cloudflare Workers AI → Gemini fallback).
 * The model must preserve {{placeholder}} tokens and **bold** markers; the
 * response is parsed + run through the same sanitizer as manual edits, so a
 * malformed AI reply can never corrupt a template.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { chat } from "@/lib/ai";
import {
  isEquipTemplateId,
  sanitizeEditableFields,
  renderEquipEmail,
  sampleEquipCtx,
  TEMPLATE_DEFAULTS,
  PLACEHOLDER_DOCS,
  EQUIP_EMAIL_TEMPLATES,
  type EditableFields,
} from "@/lib/equip/emails";
import { STREAM_META, type EquipStream } from "@/lib/equip/types";

export const runtime = "nodejs";

const isStream = (v: unknown): v is EquipStream => v === "venture_connect" || v === "venture_lift";

function extractJson(raw: string): unknown {
  if (typeof raw !== "string") return null; // defensive: CF may return a parsed object
  // Models love to wrap JSON in fences or prose — find the outermost object.
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const userId = (session.user as { id?: string }).id;

  const body = (await req.json().catch(() => ({}))) as {
    id?: unknown; stream?: unknown; instruction?: unknown; fields?: unknown;
  };
  if (!isEquipTemplateId(body.id) || !isStream(body.stream) || !TEMPLATE_DEFAULTS[body.id][body.stream]) {
    return NextResponse.json({ error: "Unknown template." }, { status: 400 });
  }
  const instruction = typeof body.instruction === "string" ? body.instruction.trim().slice(0, 600) : "";
  if (instruction.length < 3) {
    return NextResponse.json({ error: "Tell the AI what to change (e.g. “make it warmer and shorter”)." }, { status: 400 });
  }
  const current = sanitizeEditableFields(body.fields);
  if (!current) return NextResponse.json({ error: "Invalid current fields." }, { status: 400 });

  const tplInfo = EQUIP_EMAIL_TEMPLATES.find((t) => t.id === body.id)!;
  const streamMeta = STREAM_META[body.stream];

  const system = [
    "You rewrite transactional email templates for BioHubNet's EQUIP grant program (Canadian biotech talent + venture funding).",
    `This template is "${tplInfo.label}" — it sends when: ${tplInfo.when}. Stream: ${streamMeta.name} (${streamMeta.blurb})`,
    "Tone: professional, warm, concise, plain language. No hype, no exclamation overload.",
    "HARD RULES:",
    "- Preserve every {{placeholder}} token EXACTLY as written wherever the meaning still needs it. Never invent new placeholder names.",
    "- Use **double asterisks** for bold. No other markup, no HTML, no links (the button is separate).",
    "- The first paragraph should greet the applicant (e.g. \"Hi {{firstName}},\").",
    "- 2–6 paragraphs total. Subject under 80 characters.",
    'Respond with ONLY a JSON object: {"subject": string, "heading": string, "paras": string[], "ctaLabel": string, "footnote": string (optional, omit if none)}',
  ].join("\n");

  const user = [
    `Current template:\n${JSON.stringify({ subject: current.subject, heading: current.heading, paras: current.paras, ctaLabel: current.ctaLabel ?? "", footnote: current.footnote ?? "" }, null, 2)}`,
    `Available placeholders:\n${PLACEHOLDER_DOCS.map((p) => `${p.token} — ${p.desc}`).join("\n")}`,
    `Instruction from the admin: ${instruction}`,
  ].join("\n\n");

  const res = await chat(
    [{ role: "system", content: system }, { role: "user", content: user }],
    { maxTokens: 900, temperature: 0.6, feature: "equip_email_assist", userId },
  );
  if (!res.ok) {
    return NextResponse.json({ error: `AI isn't available right now (${res.error}). Edit manually or try again.` }, { status: 502 });
  }

  const proposed = sanitizeEditableFields(extractJson(res.text) as EditableFields | null);
  if (!proposed) {
    return NextResponse.json({ error: "The AI returned something unusable — try rephrasing the instruction." }, { status: 422 });
  }

  const built = renderEquipEmail(body.id, sampleEquipCtx(body.stream), proposed);
  return NextResponse.json({ ok: true, fields: proposed, subject: built.subject, html: built.html });
}
