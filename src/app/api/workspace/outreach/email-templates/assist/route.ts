/**
 * AI-assisted rewrite of an outreach email template (admin-only).
 *   POST /api/workspace/outreach/email-templates/assist
 *     { id, instruction, subject, body }
 *   → { subject, body } — a PROPOSED rewrite (never auto-saved; the admin
 *     reviews + saves). Preserves {{placeholders}}. Parsed + sanitized like a
 *     manual edit, so a malformed reply can't corrupt a template.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { chat } from "@/lib/ai";
import {
  isOutreachTemplateId,
  sanitizeTemplateEdit,
  findTemplate,
  OUTREACH_PLACEHOLDERS,
} from "@/lib/outreach/templates";

export const runtime = "nodejs";

function extractJson(raw: string): unknown {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
}

export async function POST(req: NextRequest) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const userId = (session.user as { id?: string }).id;

  const body = (await req.json().catch(() => ({}))) as { id?: unknown; instruction?: unknown; subject?: unknown; body?: unknown };
  if (!isOutreachTemplateId(body.id)) return NextResponse.json({ error: "Unknown template." }, { status: 400 });
  const instruction = typeof body.instruction === "string" ? body.instruction.trim().slice(0, 600) : "";
  if (instruction.length < 3) return NextResponse.json({ error: "Tell the AI what to change (e.g. “warmer, shorter”)." }, { status: 400 });
  const current = sanitizeTemplateEdit(body);
  if (!current) return NextResponse.json({ error: "Invalid current template." }, { status: 400 });

  const info = findTemplate(body.id);
  const system = [
    "You rewrite partner cross-promotion outreach email templates for BioHubNet (a Canadian biomanufacturing talent + venture non-profit). The recipient is a busy comms/partnerships person at a partner organisation being asked to share a BHN opportunity with their network.",
    info ? `This template is "${info.label}" — used when: ${info.when}.` : "",
    "Keep it concise (under ~150 words), warm, professional, with ONE clear call to action and an easy-to-forward ask. Subject lines short and specific.",
    "HARD RULES: preserve {{placeholder}} tokens exactly where the meaning needs them; never invent new placeholder names; plain text only (no markdown, no HTML); use \\n for line breaks; sign off with {{senderName}} / {{senderTitle}}.",
    'Respond with ONLY JSON: {"subject": string, "body": string}',
  ].filter(Boolean).join("\n");
  const user = [
    `Current template:\nSUBJECT: ${current.subject}\nBODY:\n${current.body}`,
    `Available placeholders:\n${OUTREACH_PLACEHOLDERS.map((p) => `${p.token} — ${p.desc}`).join("\n")}`,
    `Instruction: ${instruction}`,
  ].join("\n\n");

  const res = await chat([{ role: "system", content: system }, { role: "user", content: user }], {
    maxTokens: 900, temperature: 0.6, feature: "outreach_template_assist", userId,
  });
  if (!res.ok) return NextResponse.json({ error: `AI isn't available right now (${res.error}). Edit manually or try again.` }, { status: 502 });

  const proposed = sanitizeTemplateEdit(extractJson(res.text));
  if (!proposed) return NextResponse.json({ error: "The AI returned something unusable — try rephrasing." }, { status: 422 });
  return NextResponse.json({ ok: true, ...proposed });
}
