"use server";

/**
 * Filming day: the timeline's edits. Every action re-checks the role — a
 * server action is a public endpoint, whatever page calls it. Clashes are
 * the admin's call: the timeline shows them rather than refusing a move,
 * because rearranging two people usually passes through one.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GROUPS, KINDS } from "@/lib/video/filming";
import { filmingPath } from "@/lib/video/paths";

type Result = { ok: true; id?: string } | { ok: false; error: string };
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const firstError = (e: z.ZodError) => e.issues[0]?.message ?? "Check the fields.";

async function requireAdmin() {
  await requireRole("admin");
}
async function projectOf(scheduleId: string) {
  return (await prisma.filmingSchedule.findUnique({ where: { id: scheduleId }, select: { projectId: true } }))?.projectId ?? null;
}
const done = (projectId: string, id?: string): Result => {
  revalidatePath(filmingPath(projectId));
  return { ok: true, id };
};

// ── the day ──────────────────────────────────────────────────────────

export async function createFilmingSchedule(projectId: string, date: string): Promise<Result> {
  await requireAdmin();
  if (!DATE.test(date)) return { ok: false, error: "Pick the shoot date." };
  const project = await prisma.videoProject.findUnique({ where: { id: projectId }, select: { title: true, filming: { select: { id: true } } } });
  if (!project) return { ok: false, error: "That project no longer exists." };
  if (project.filming) return { ok: false, error: "This project already has a filming day." };
  await prisma.filmingSchedule.create({ data: { projectId, title: `${project.title} — filming day`, date: new Date(`${date}T00:00:00Z`) } });
  return done(projectId);
}

const DayEdit = z.object({
  title: z.string().trim().min(1, "Give the day a title.").max(160),
  date: z.string().regex(DATE),
  location: z.string().trim().max(300),
  opensAt: z.string().regex(HHMM),
  closesAt: z.string().regex(HHMM),
  notes: z.string().trim().max(2000),
}).refine((v) => v.opensAt < v.closesAt, { message: "The building must open before it closes." });

export async function updateFilmingDay(scheduleId: string, input: unknown): Promise<Result> {
  await requireAdmin();
  const p = DayEdit.safeParse(input);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  const projectId = await projectOf(scheduleId);
  if (!projectId) return { ok: false, error: "That filming day no longer exists." };
  await prisma.filmingSchedule.update({ where: { id: scheduleId }, data: { ...p.data, date: new Date(`${p.data.date}T00:00:00Z`) } });
  return done(projectId);
}

// ── people ───────────────────────────────────────────────────────────

const PersonEdit = z.object({
  name: z.string().trim().min(1, "A name, please.").max(120),
  group: z.enum(GROUPS),
  role: z.string().trim().max(200),
  email: z.string().trim().max(200),
});

export async function addFilmingPerson(scheduleId: string, input: unknown): Promise<Result> {
  await requireAdmin();
  const p = PersonEdit.safeParse(input);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  const projectId = await projectOf(scheduleId);
  if (!projectId) return { ok: false, error: "That filming day no longer exists." };
  const row = await prisma.filmingPerson.create({ data: { ...p.data, scheduleId }, select: { id: true } });
  return done(projectId, row.id);
}

export async function updateFilmingPerson(personId: string, input: unknown): Promise<Result> {
  await requireAdmin();
  const p = PersonEdit.safeParse(input);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  const row = await prisma.filmingPerson.findUnique({ where: { id: personId }, select: { schedule: { select: { projectId: true } } } });
  if (!row) return { ok: false, error: "That person is no longer on the day." };
  await prisma.filmingPerson.update({ where: { id: personId }, data: p.data });
  return done(row.schedule.projectId);
}

/** Take somebody off the day, and off every task they were on. */
export async function deleteFilmingPerson(personId: string): Promise<Result> {
  await requireAdmin();
  const row = await prisma.filmingPerson.findUnique({ where: { id: personId }, select: { scheduleId: true, schedule: { select: { projectId: true } } } });
  if (!row) return { ok: false, error: "That person is no longer on the day." };
  const onTasks = await prisma.filmingBlock.findMany({ where: { scheduleId: row.scheduleId, people: { has: personId } }, select: { id: true, people: true } });
  await prisma.$transaction([
    ...onTasks.map((b) => prisma.filmingBlock.update({ where: { id: b.id }, data: { people: b.people.filter((x) => x !== personId) } })),
    prisma.filmingPerson.delete({ where: { id: personId } }),
  ]);
  return done(row.schedule.projectId);
}

// ── tasks ────────────────────────────────────────────────────────────

const BlockEdit = z.object({
  kind: z.enum(KINDS),
  title: z.string().trim().min(1, "Give the task a name.").max(160),
  notes: z.string().trim().max(1000),
  start: z.string().datetime(),
  end: z.string().datetime(),
  prepMinutes: z.number().int().min(0).max(240),
  locked: z.boolean(),
  flexible: z.boolean(),
  people: z.array(z.string().max(40)).max(50),
}).refine((v) => new Date(v.start) < new Date(v.end), { message: "A task must end after it starts." })
  .refine((v) => v.prepMinutes * 60_000 < new Date(v.end).getTime() - new Date(v.start).getTime(), { message: "Preparation must be shorter than the task." });

/** Only people who are on this day can be put on its tasks. */
async function knownPeople(scheduleId: string, ids: string[]) {
  const rows = await prisma.filmingPerson.findMany({ where: { scheduleId, id: { in: ids } }, select: { id: true } });
  const ok = new Set(rows.map((r) => r.id));
  return [...new Set(ids)].filter((id) => ok.has(id));
}

export async function addFilmingBlock(scheduleId: string, input: unknown): Promise<Result> {
  await requireAdmin();
  const p = BlockEdit.safeParse(input);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  const projectId = await projectOf(scheduleId);
  if (!projectId) return { ok: false, error: "That filming day no longer exists." };
  const row = await prisma.filmingBlock.create({
    data: { ...p.data, scheduleId, start: new Date(p.data.start), end: new Date(p.data.end), people: await knownPeople(scheduleId, p.data.people) },
    select: { id: true },
  });
  return done(projectId, row.id);
}

/** Any change to a task: a drag on the timeline, a person dropped on it, its form. */
export async function updateFilmingBlock(blockId: string, input: unknown): Promise<Result> {
  await requireAdmin();
  const p = BlockEdit.safeParse(input);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  const row = await prisma.filmingBlock.findUnique({ where: { id: blockId }, select: { scheduleId: true, schedule: { select: { projectId: true } } } });
  if (!row) return { ok: false, error: "That task no longer exists." };
  await prisma.filmingBlock.update({
    where: { id: blockId },
    data: { ...p.data, start: new Date(p.data.start), end: new Date(p.data.end), people: await knownPeople(row.scheduleId, p.data.people) },
  });
  return done(row.schedule.projectId);
}

export async function deleteFilmingBlock(blockId: string): Promise<Result> {
  await requireAdmin();
  const row = await prisma.filmingBlock.findUnique({ where: { id: blockId }, select: { schedule: { select: { projectId: true } } } });
  if (!row) return { ok: false, error: "That task no longer exists." };
  await prisma.filmingBlock.delete({ where: { id: blockId } });
  return done(row.schedule.projectId);
}
