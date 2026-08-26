/**
 * Admin management of an event's speakers.
 *
 *   PATCH  → { action } — toggle public intake, or edit one speaker
 *   DELETE → { speakerId } — remove a speaker and their headshot
 *
 * The public counterpart that speakers themselves post to is
 * /api/events/[slug]/speaker-intake.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteR2ObjectByUrl } from "@/lib/r2";
import { countWords } from "@/lib/events/bio";
import {
  speakerLimits, clampWordLimit, maxCharsFor,
  WORD_LIMIT_MAX,
} from "@/lib/events/limits";

export const runtime = "nodejs";

const PatchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setIntake"), open: z.boolean() }),
  /* null means "use the platform default" — the input is cleared, not
     set to zero, so an admin can always get back to the shipped value. */
  z.object({
    action: z.literal("setWordLimits"),
    bio: z.number().int().nullable().optional(),
    pitch: z.number().int().nullable().optional(),
  }),
  z.object({
    action: z.literal("editSpeaker"),
    speakerId: z.string().min(1),
    fullName: z.string().trim().min(2).max(120).optional(),
    title: z.string().trim().max(160).nullable().optional(),
    organization: z.string().trim().max(160).nullable().optional(),
    // Bounded here only by the cheap character backstop; the word rule
    // depends on the event's own limit, so it is enforced in the handler
    // where the event has been loaded.
    bio: z.string().trim().max(maxCharsFor(WORD_LIMIT_MAX)).nullable().optional(),
    topics: z.array(z.string().trim().max(80)).max(12).optional(),
    displayOrder: z.number().int().min(0).max(999).optional(),
  }),
]);

async function eventFor(slug: string) {
  return prisma.bhnEvent.findUnique({
    where: { slug },
    select: { id: true, speakerBioMaxWords: true, speakerPitchMaxWords: true },
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { slug } = await ctx.params;
  const event = await eventFor(slug);
  if (!event) return NextResponse.json({ error: "Unknown event." }, { status: 404 });

  const parsed = PatchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  if (parsed.data.action === "setIntake") {
    await prisma.bhnEvent.update({
      where: { id: event.id },
      data: { speakerIntakeOpen: parsed.data.open },
    });
    return NextResponse.json({ ok: true, open: parsed.data.open });
  }

  if (parsed.data.action === "setWordLimits") {
    /*
     * Clamped rather than rejected. Somebody typing 5 into the bio box
     * means "much shorter", not "make the form impossible to submit" —
     * and an error message about a bound they cannot see is a worse
     * answer than the nearest legal number, which the UI then shows
     * them. Clearing the box sends null, which restores the default.
     */
    const bio = parsed.data.bio === undefined ? undefined : clampWordLimit(parsed.data.bio);
    const pitch = parsed.data.pitch === undefined ? undefined : clampWordLimit(parsed.data.pitch);
    const updated = await prisma.bhnEvent.update({
      where: { id: event.id },
      data: {
        ...(bio !== undefined ? { speakerBioMaxWords: bio } : {}),
        ...(pitch !== undefined ? { speakerPitchMaxWords: pitch } : {}),
      },
      select: { speakerBioMaxWords: true, speakerPitchMaxWords: true },
    });
    // The resolved numbers, so the UI shows what is actually in force
    // rather than what was typed.
    return NextResponse.json({ ok: true, limits: speakerLimits(updated), stored: updated });
  }

  const { speakerId, action: _action, ...rest } = parsed.data;
  // Scoped to this event, so a speaker id from another event cannot be
  // edited by guessing it.
  const owned = await prisma.speaker.findFirst({
    where: { id: speakerId, eventId: event.id },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: "No such speaker." }, { status: 404 });

  if (typeof rest.bio === "string") {
    const limit = speakerLimits(event).bio;
    const words = countWords(rest.bio);
    if (words > limit) {
      return NextResponse.json(
        { error: `Keep the bio to ${limit} words or fewer — this one is ${words}.` },
        { status: 400 },
      );
    }
  }

  const data = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No changes." }, { status: 400 });
  }
  await prisma.speaker.update({ where: { id: owned.id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { slug } = await ctx.params;
  const event = await eventFor(slug);
  if (!event) return NextResponse.json({ error: "Unknown event." }, { status: 404 });

  const { speakerId } = (await req.json().catch(() => ({}))) as { speakerId?: string };
  if (!speakerId) return NextResponse.json({ error: "speakerId required" }, { status: 400 });

  const speaker = await prisma.speaker.findFirst({
    where: { id: speakerId, eventId: event.id },
    select: { id: true, photoUrl: true },
  });
  if (!speaker) return NextResponse.json({ error: "No such speaker." }, { status: 404 });

  await prisma.speaker.delete({ where: { id: speaker.id } });
  // Best-effort: an orphaned object costs pennies, a failed delete
  // should not fail the admin's action.
  if (speaker.photoUrl) await deleteR2ObjectByUrl(speaker.photoUrl).catch(() => {});
  return NextResponse.json({ ok: true });
}
