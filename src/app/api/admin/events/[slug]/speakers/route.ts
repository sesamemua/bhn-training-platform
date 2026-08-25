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
import { BIO_MAX_WORDS, BIO_MAX_CHARS, countWords } from "@/lib/events/bio";

export const runtime = "nodejs";

const PatchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setIntake"), open: z.boolean() }),
  z.object({
    action: z.literal("editSpeaker"),
    speakerId: z.string().min(1),
    fullName: z.string().trim().min(2).max(120).optional(),
    title: z.string().trim().max(160).nullable().optional(),
    organization: z.string().trim().max(160).nullable().optional(),
    // Words, not characters — the same rule the speaker's own form
    // enforces. A 2500-character cap would have refused a bio the
    // public form had just accepted.
    bio: z
      .string()
      .trim()
      // Length first, so the refine never splits a huge string.
      .max(BIO_MAX_CHARS)
      .refine((v) => countWords(v) <= BIO_MAX_WORDS, {
        message: `Keep the bio to ${BIO_MAX_WORDS} words or fewer.`,
      })
      .nullable()
      .optional(),
    topics: z.array(z.string().trim().max(80)).max(12).optional(),
    displayOrder: z.number().int().min(0).max(999).optional(),
  }),
]);

async function eventFor(slug: string) {
  return prisma.bhnEvent.findUnique({ where: { slug }, select: { id: true } });
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

  const { speakerId, action: _action, ...rest } = parsed.data;
  // Scoped to this event, so a speaker id from another event cannot be
  // edited by guessing it.
  const owned = await prisma.speaker.findFirst({
    where: { id: speakerId, eventId: event.id },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: "No such speaker." }, { status: 404 });

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
