/**
 * Generic AI rewrite for any free-text field on the resume.
 *
 *   POST /api/profile/resume/structure/rewrite-text
 *     body: {
 *       original:    string;            // current text
 *       context?:    string;            // optional surrounding context (e.g. "Resume header summary", "Description under STEMCELL · Process Intern")
 *       instruction?: string;           // optional steering note (e.g. "tighten to 2 sentences")
 *     }
 *
 * Returns { ok, rewritten, changed } — preview only. Nothing is
 * persisted. The client picks where to apply (header.summary,
 * item.description, item.title, etc.) and auto-save handles the
 * actual DB write through the existing PATCH path.
 *
 * Separate from /rewrite-bullet because that endpoint understands
 * the resume tree (locates the bullet by id, marks it aiSuggested,
 * stamps a revision). This one is a pure text → text helper.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { callStructured } from "@/lib/ai/reliability";

export const runtime = "nodejs";

const SYSTEM = `You rewrite a single piece of resume text to be stronger.

PRINCIPLES:
- Plain, professional English. No filler ("responsible for", "tasked with", "in charge of").
- Quantify outcomes only when numbers exist in the original — never invent.
- Keep the original's information. Don't drop facts; don't add new ones.
- Match length: a one-line title stays one line; a paragraph summary stays a paragraph.
- Preserve any [demo] prefix exactly as-is at the start, if present.

OUTPUT STRICTLY this JSON:
{ "rewritten": "the rewritten text" }

No prose, no markdown fences, no commentary outside the JSON.`;

// Matches the tolerant shape the old code parsed: { rewritten?: string }.
// We require a non-empty (after-trim) string so a missing/blank rewrite routes
// to the same failure path as the original `if (!rewritten)` guard.
const RewriteSchema = z.object({
  rewritten: z.string().trim().min(1),
});

export async function POST(req: NextRequest) {
  const session = await requireSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id?: string }).id ?? null;

  const body = (await req.json().catch(() => ({}))) as {
    original?: unknown;
    context?: unknown;
    instruction?: unknown;
  };
  const original = typeof body.original === "string" ? body.original.trim() : "";
  if (!original) {
    return NextResponse.json({ error: "original required" }, { status: 400 });
  }
  // Defensive cap — the field shouldn't be a 5MB blob; trim aggressively.
  if (original.length > 4000) {
    return NextResponse.json({ error: "original too long (max 4000 chars)" }, { status: 400 });
  }
  const context = typeof body.context === "string" ? body.context.slice(0, 400) : "";
  const instruction = typeof body.instruction === "string" ? body.instruction.slice(0, 400) : "";

  const userMsg: string[] = [`ORIGINAL TEXT:\n${original}`];
  if (context) userMsg.push(`CONTEXT: ${context}`);
  if (instruction) userMsg.push(`STEERING: ${instruction}`);
  else userMsg.push("Improve the text per the principles above.");

  const r = await callStructured(
    [
      { role: "system", content: SYSTEM },
      { role: "user",   content: userMsg.join("\n\n") },
    ],
    RewriteSchema,
    { userId, feature: "resume_rewrite_text", maxTokens: 600, temperature: 0.5 },
  );
  if (!r.ok) {
    return NextResponse.json({ error: "AI didn't return a usable rewrite." }, { status: 502 });
  }
  // schema guarantees a non-empty, trimmed string.
  const rewritten = r.data.rewritten;
  const normalized = (s: string) => s.replace(/\s+/g, " ").trim();
  const changed = normalized(rewritten) !== normalized(original);

  return NextResponse.json({ ok: true, original, rewritten, changed });
}
