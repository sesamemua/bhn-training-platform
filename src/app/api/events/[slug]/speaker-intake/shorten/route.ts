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
import { BIO_LIMIT, BIO_TARGET_MIN, tidyBio } from "@/lib/events/bio";
import type { ChatMessage } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 30;

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

  /*
   * Already fits: hand it straight back.
   *
   * Rewriting a bio that is inside the limit is not shortening, it is
   * editing somebody's own words for no reason — and it was the shortest
   * path to the complaint that this makes things "way too short", since
   * a 200-character bio came back at 120.
   */
  if (bio.length <= BIO_LIMIT) {
    return NextResponse.json({ ok: true, bio, length: bio.length, alreadyFits: true });
  }

  const SYSTEM: ChatMessage = {
    role: "system",
    content: [
      `You shorten a conference speaker's own biography so that it fits a ${BIO_LIMIT}-character limit.`,
      'Reply as JSON: { "bio": "..." }',
      "",
      "LENGTH — read this twice:",
      `- Aim for ${BIO_TARGET_MIN}-${BIO_LIMIT} characters, including spaces. That is the target, not a maximum to stay well under.`,
      `- Never exceed ${BIO_LIMIT}.`,
      `- Coming back with 120 characters when the original had more to say is a FAILURE, not a job well done. The limit is a shelf to fill.`,
      `- Cut only as much as it takes to fit. If the original is 300 characters, the answer is about ${BIO_LIMIT} — not 150.`,
      "",
      "CONTENT:",
      "- Keep it in the third person and keep the speaker's own facts: role, employer, field, notable credentials.",
      "- NEVER invent a title, employer, award, degree or number that is not in the original.",
      "- When something must go, drop the least load-bearing detail first — but only once you are over the limit.",
      "- Plain prose. No markdown, no bullet points, no quotation marks around the whole thing.",
    ].join("\n"),
  };

  const ask = (extra?: string) =>
    callStructured(
      [
        SYSTEM,
        ...(extra ? [{ role: "system" as const, content: extra }] : []),
        { role: "user" as const, content: bio },
      ],
      Out,
      { userId: null, feature: "speaker.bio.shorten", maxTokens: 400, temperature: 0.2 },
    );

  let r = await ask();
  if (!r.ok) {
    return NextResponse.json({ error: "Couldn't shorten it just now — please trim it by hand." }, { status: 502 });
  }

  /*
   * One retry when it over-cuts.
   *
   * Asking again with the actual number it produced is far more
   * effective than a stronger instruction up front — the model can see
   * its own answer was too short, which it could not before. Only once:
   * a second failure means the source really was that thin, and two
   * more seconds of spinner is worse than a short suggestion the
   * speaker can edit.
   */
  const tooShort = (t: string) => t.trim().length < BIO_TARGET_MIN && bio.length > BIO_LIMIT;
  if (tooShort(r.data.bio)) {
    const retry = await ask(
      `Your previous answer was ${r.data.bio.trim().length} characters. That is too short — ` +
      `the target is ${BIO_TARGET_MIN}-${BIO_LIMIT}. Put back detail from the original that you cut ` +
      `unnecessarily, and get as close to ${BIO_LIMIT} as the facts allow without going over.`,
    );
    // Keep the longer of the two: the retry is an improvement or it is
    // not, and there is no third opinion worth waiting for.
    if (retry.ok && retry.data.bio.trim().length > r.data.bio.trim().length) r = retry;
  }

  const out = tidyBio(r.data.bio);
  return NextResponse.json({ ok: true, bio: out, length: out.length, alreadyFits: false });
}

