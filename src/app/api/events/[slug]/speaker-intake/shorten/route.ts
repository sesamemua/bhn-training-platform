/**
 * POST /api/events/[slug]/speaker-intake/shorten
 *
 * Public, and deliberately narrow: takes the bio a speaker just typed and
 * returns a version inside the 250-character limit. It never saves
 * anything — the speaker reads the suggestion, edits it if they want, and
 * only their approved text is submitted.
 *
 * Gated on the event's intake being open, so this is not a free
 * text-rewriting endpoint for anyone who finds the URL.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { callStructured } from "@/lib/ai/reliability";
import type { ChatMessage } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 30;

export const BIO_LIMIT = 250;

const Out = z.object({ bio: z.string() });

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const event = await prisma.bhnEvent.findUnique({
    where: { slug },
    select: { speakerIntakeOpen: true },
  });
  if (!event?.speakerIntakeOpen) {
    return NextResponse.json({ error: "Not accepting submissions." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { bio?: string };
  const bio = String(body.bio ?? "").trim();
  if (bio.length < 30) {
    return NextResponse.json({ error: "Write a little more first, then I can shorten it." }, { status: 400 });
  }
  if (bio.length > 4000) {
    return NextResponse.json({ error: "That's longer than I can work with — trim it a little first." }, { status: 400 });
  }

  const SYSTEM: ChatMessage = {
    role: "system",
    content: [
      `You shorten a conference speaker's own biography to fit ${BIO_LIMIT} characters.`,
      'Reply as JSON: { "bio": "..." }',
      "",
      "Rules:",
      `- The result MUST be ${BIO_LIMIT} characters or fewer, including spaces.`,
      "- Keep it in the third person and keep the speaker's own facts: role, employer, field, notable credentials.",
      "- NEVER invent a title, employer, award, degree or number that is not in the original.",
      "- Drop the least load-bearing detail first. A shorter accurate bio beats a full one that is wrong.",
      "- Plain prose. No markdown, no bullet points, no quotation marks around the whole thing.",
    ].join("\n"),
  };

  const r = await callStructured(
    [SYSTEM, { role: "user", content: bio }],
    Out,
    { userId: null, feature: "speaker.bio.shorten", maxTokens: 400, temperature: 0.2 },
  );
  if (!r.ok) {
    return NextResponse.json({ error: "Couldn't shorten it just now — please trim it by hand." }, { status: 502 });
  }

  // The model is asked for a limit, not trusted to hit it. Cut at a word
  // boundary so an over-long reply degrades to something readable rather
  // than a severed word.
  let out = r.data.bio.trim().replace(/^["“]|["”]$/g, "");
  if (out.length > BIO_LIMIT) {
    out = out.slice(0, BIO_LIMIT);
    const sp = out.lastIndexOf(" ");
    if (sp > BIO_LIMIT - 40) out = out.slice(0, sp);
    out = out.replace(/[,;:]$/, "").trim();
  }
  return NextResponse.json({ ok: true, bio: out, length: out.length });
}
