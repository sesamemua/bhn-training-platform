"use server";

/**
 * Filming-slot sign-ups: the public form's one action, and the team's
 * controls for the link. The public action trusts nothing but the token:
 * it re-checks that the link is open, the time is free and in the window,
 * and the email has not signed up already — inside one serializable
 * transaction, so two trainees clicking the same time cannot both get it.
 * No email is sent; the team confirms people themselves.
 */
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { atMinute, hhmmToMinutes } from "@/lib/video/filming";
import { MAX_SIGNUPS, SignupSchema, isFree, takenSpans } from "@/lib/video/signup";
import { filmingPath, signupsPath } from "@/lib/video/paths";

type Result = { ok: true } | { ok: false; error: string };
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const refresh = (projectId: string, token?: string | null) => {
  revalidatePath(signupsPath(projectId));
  revalidatePath(filmingPath(projectId));
  if (token) revalidatePath(`/film/${token}`);
};

export async function signUpForFilming(token: string, input: unknown): Promise<Result> {
  const p = SignupSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the form." };
  const { name, email, start, parking } = p.data;
  try {
    return await prisma.$transaction(async (tx) => {
      const day = await tx.filmingSchedule.findUnique({
        where: { bookingToken: token },
        select: { id: true, projectId: true, date: true, isOpen: true, openFrom: true, openTo: true, slotMinutes: true, prepMinutes: true,
          blocks: { select: { start: true, end: true, prepMinutes: true, locked: true } },
          people: { where: { signedUpAt: { not: null } }, select: { email: true } } },
      });
      if (!day?.isOpen) return { ok: false as const, error: "Sign-ups for this shoot are closed." };
      if (day.people.length >= MAX_SIGNUPS) return { ok: false as const, error: "Every place has been taken." };
      if (day.people.some((x) => x.email.toLowerCase() === email)) return { ok: false as const, error: "That email has already signed up. Ask the team if you need to change your time." };
      if (start < hhmmToMinutes(day.openFrom) || start + day.slotMinutes > hhmmToMinutes(day.openTo)) return { ok: false as const, error: "Pick a time inside the hours shown." };
      const blocks = day.blocks.map((b) => ({ ...b, start: b.start.toISOString(), end: b.end.toISOString() }));
      if (!isFree(start, day.slotMinutes, day.prepMinutes, takenSpans(blocks))) return { ok: false as const, error: "Someone has just taken that time — pick another." };
      const date = day.date.toISOString().slice(0, 10);
      const person = await tx.filmingPerson.create({
        data: { scheduleId: day.id, name, email, group: "trainee", role: "Trainee — signed up", parking, signedUpAt: new Date() },
        select: { id: true },
      });
      await tx.filmingBlock.create({
        data: {
          scheduleId: day.id, kind: "interview", title: `Interview — ${name}`,
          notes: `Signed up through the link.${parking ? " Needs a parking spot." : ""}`,
          start: new Date(atMinute(date, start)), end: new Date(atMinute(date, start + day.slotMinutes)),
          prepMinutes: day.prepMinutes, locked: true, people: [person.id],
        },
      });
      refresh(day.projectId);
      return { ok: true as const };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (e) {
    // Two sign-ups racing for the same time: one of them loses here.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") return { ok: false, error: "Someone has just taken that time — pick another." };
    throw e;
  }
}

// ── the team's controls ──────────────────────────────────────────────

async function dayOf(scheduleId: string) {
  await requireRole("admin");
  return prisma.filmingSchedule.findUnique({ where: { id: scheduleId }, select: { projectId: true, bookingToken: true } });
}

/** Open sign-ups (making the link the first time), or close them. */
export async function setSignupsOpen(scheduleId: string, open: boolean): Promise<Result> {
  const day = await dayOf(scheduleId);
  if (!day) return { ok: false, error: "That filming day no longer exists." };
  const token = day.bookingToken ?? randomBytes(16).toString("base64url");
  await prisma.filmingSchedule.update({ where: { id: scheduleId }, data: { isOpen: open, bookingToken: token } });
  refresh(day.projectId, token);
  return { ok: true };
}

/** A fresh link; the old one stops working. */
export async function newSignupLink(scheduleId: string): Promise<Result> {
  const day = await dayOf(scheduleId);
  if (!day) return { ok: false, error: "That filming day no longer exists." };
  await prisma.filmingSchedule.update({ where: { id: scheduleId }, data: { bookingToken: randomBytes(16).toString("base64url") } });
  refresh(day.projectId, day.bookingToken);
  return { ok: true };
}

const Settings = z.object({
  openFrom: z.string().regex(HHMM),
  openTo: z.string().regex(HHMM),
  slotMinutes: z.number().int().min(10).max(240),
  prepMinutes: z.number().int().min(0).max(120),
}).refine((v) => v.openFrom < v.openTo, { message: "Sign-ups must open before they close." })
  .refine((v) => v.prepMinutes < v.slotMinutes, { message: "Preparation must be shorter than the slot." })
  .refine((v) => hhmmToMinutes(v.openTo) - hhmmToMinutes(v.openFrom) >= v.slotMinutes, { message: "The window is shorter than one slot." });

export async function saveSignupSettings(scheduleId: string, input: unknown): Promise<Result> {
  const day = await dayOf(scheduleId);
  if (!day) return { ok: false, error: "That filming day no longer exists." };
  const p = Settings.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the fields." };
  await prisma.filmingSchedule.update({ where: { id: scheduleId }, data: p.data });
  refresh(day.projectId, day.bookingToken);
  return { ok: true };
}

/** Take a sign-up off the day: their slot and them. */
export async function removeSignup(personId: string): Promise<Result> {
  await requireRole("admin");
  const row = await prisma.filmingPerson.findUnique({ where: { id: personId }, select: { scheduleId: true, schedule: { select: { projectId: true, bookingToken: true } } } });
  if (!row) return { ok: false, error: "That sign-up is already gone." };
  const onTasks = await prisma.filmingBlock.findMany({
    where: { scheduleId: row.scheduleId, OR: [{ people: { has: personId } }, { facilitators: { has: personId } }] },
    select: { id: true, people: true, facilitators: true },
  });
  await prisma.$transaction([
    // Their own slot goes; anything they were added to keeps everyone else.
    ...onTasks.map((b) => b.people.length === 1 && b.people[0] === personId && !b.facilitators.length
      ? prisma.filmingBlock.delete({ where: { id: b.id } })
      : prisma.filmingBlock.update({ where: { id: b.id }, data: { people: b.people.filter((x) => x !== personId), facilitators: b.facilitators.filter((x) => x !== personId) } })),
    prisma.filmingPerson.delete({ where: { id: personId } }),
  ]);
  refresh(row.schedule.projectId, row.schedule.bookingToken);
  return { ok: true };
}
