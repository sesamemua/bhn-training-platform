/**
 * POST /api/events/[slug]/speaker-intake/shorten
 *
 * Public, and deliberately narrow: takes the bio a speaker just typed and
 * returns a version inside the 250-WORD limit. It never saves anything —
 * the speaker reads the suggestion, edits it if they want, and only their
 * approved text is submitted.
 *
 * At a 250-word limit most bios already fit, so the common answer here is
 * "nothing to do" rather than a rewrite. That is the point: this exists
 * for the speaker who pastes four hundred words of a faculty page.
 *
 * Gated on the event's intake being open, so this is not a free
 * text-rewriting endpoint for anyone who finds the URL.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { callStructured } from "@/lib/ai/reliability";
import {
  BIO_INPUT_MAX_WORDS,
  BIO_INPUT_MAX_CHARS,
  countWords,
  tidyToWords,
} from "@/lib/events/bio";
import {
  PITCH_INPUT_MAX_CHARS,
  PITCH_INPUT_MAX_WORDS,
} from "@/lib/events/pitch";
import type { ChatMessage } from "@/lib/ai";
import { speakerLimits, targetMinFor } from "@/lib/events/limits";

export const runtime = "nodejs";
export const maxDuration = 60;

const Out = z.object({ bio: z.string() });

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const event = await prisma.bhnEvent.findUnique({
    where: { slug },
    select: {
      speakerIntakeOpen: true,
      speakerBioMaxWords: true,
      speakerPitchMaxWords: true,
    },
  });
  if (!event?.speakerIntakeOpen) {
    return NextResponse.json({ error: "Not accepting submissions." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { bio?: string; field?: string };
  const bio = String(body.bio ?? "").trim();
  // Which box is being shortened. Defaults to the bio so an older client
  // that predates the session pitch keeps working unchanged.
  const isPitch = body.field === "pitch";
  // The event's own limits, not the platform defaults. The target floor
  // scales with them: it exists to stop the model over-cutting, and a
  // fixed 200 against a limit an admin moved to 80 would demand padding.
  const limits = speakerLimits(event);
  const MAX_WORDS = isPitch ? limits.pitch : limits.bio;
  const TARGET_MIN = targetMinFor(MAX_WORDS);
  const INPUT_MAX_WORDS = isPitch ? PITCH_INPUT_MAX_WORDS : BIO_INPUT_MAX_WORDS;
  const INPUT_MAX_CHARS = isPitch ? PITCH_INPUT_MAX_CHARS : BIO_INPUT_MAX_CHARS;
  const noun = isPitch ? "session description" : "biography";

  // Length before word count: tokenizing allocates, and
  // this endpoint is public.
  if (bio.length > INPUT_MAX_CHARS) {
    return NextResponse.json({ error: "That's longer than I can work with." }, { status: 413 });
  }

  const have = countWords(bio);

  if (have === 0) {
    return NextResponse.json({ error: `Write a ${noun} first, then I can shorten it.` }, { status: 400 });
  }
  if (have > INPUT_MAX_WORDS) {
    return NextResponse.json(
      { error: `That's ${have} words — longer than I can work with. Trim it to roughly a page first.` },
      { status: 400 },
    );
  }

  /*
   * Already fits: hand it straight back.
   *
   * Rewriting a bio that is inside the limit is not shortening, it is
   * editing somebody's own words for no reason — and it was the shortest
   * path to the complaint that this makes things "way too short".
   */
  if (have <= MAX_WORDS) {
    return NextResponse.json({ ok: true, bio, words: have, alreadyFits: true });
  }

  const SYSTEM: ChatMessage = {
    role: "system",
    content: [
      `You shorten a conference speaker's own ${noun} so that it fits a ${MAX_WORDS}-WORD limit.`,
      'Reply as JSON: { "bio": "..." }',
      "",
      "LENGTH — read this twice:",
      `- The unit is WORDS, not characters or sentences.`,
      `- Aim for ${TARGET_MIN}-${MAX_WORDS} words. That is the target, not a maximum to stay well under.`,
      `- Never exceed ${MAX_WORDS} words.`,
      `- Coming back far under when the original had more to say is a FAILURE, not a job well done. The limit is a shelf to fill.`,
      `- Cut only as much as it takes to fit. If the original is ${MAX_WORDS + 40} words, the answer is about ${MAX_WORDS} — not half of it.`,
      "",
      "CONTENT:",
      ...(isPitch
        ? [
            "- This describes what a session will offer and who should attend. Keep both halves if the original has both.",
            "- Keep it concrete: the specific advice, examples or decisions named. Generic conference filler ('valuable insights', 'key takeaways') is what to cut FIRST.",
            "- Keep the speaker's voice, including first person if they wrote it that way.",
            "- NEVER invent a topic, audience, credential or claim that is not in the original.",
          ]
        : [
            "- Keep it in the third person and keep the speaker's own facts: role, employer, field, notable credentials.",
            "- NEVER invent a title, employer, award, degree or number that is not in the original.",
          ]),
      "- When something must go, drop the least load-bearing detail first — but only once you are over the limit.",
      "- Keep the paragraph structure of the original where it survives the cut.",
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
      {
        userId: null,
        feature: "speaker.bio.shorten",
        // 250 words is roughly 340 tokens of prose; the JSON wrapper and
        // any escaped punctuation ride on top. 400 was sized for the old
        // character limit and would have truncated every answer here.
        maxTokens: 1200,
        temperature: 0.2,
      },
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
   *
   * The floor is flat. An earlier version capped it at 80% of the
   * original, on the theory that a 260-word bio should not be pushed
   * back up to 200 — but this branch only runs when the original is
   * already over 250 words, so 80% of it is always above 200 and the
   * cap could never bind. A guard that cannot fire is worse than none:
   * it reads as protection.
   */
  const got = countWords(r.data.bio);
  if (got < TARGET_MIN) {
    const retry = await ask(
      `Your previous answer was ${got} words. That is too short — the target is ` +
      `${TARGET_MIN}-${MAX_WORDS} words. Put back detail from the original that you cut ` +
      `unnecessarily, and get as close to ${MAX_WORDS} words as the facts allow without going over.`,
    );
    // Keep the longer of the two: the retry is an improvement or it is
    // not, and there is no third opinion worth waiting for.
    if (retry.ok && countWords(retry.data.bio) > got) r = retry;
  }

  const out = tidyToWords(r.data.bio, MAX_WORDS);
  return NextResponse.json({ ok: true, bio: out, words: countWords(out), alreadyFits: false });
}
