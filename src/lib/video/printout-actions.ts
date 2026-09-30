"use server";

/**
 * Save a video project's printable signs (the built-in ones as edited, and
 * any made from scratch) and its kit list. A server action is a public endpoint, so the
 * role is checked here and the list is validated whatever the page sent.
 */
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SignsSchema, printoutsKey } from "@/lib/video/filming-notice";
import { KitStateSchema, kitKey } from "@/lib/video/kit";
import { PrepSchema, prepKey } from "@/lib/video/prep";

export async function savePrintouts(projectId: string, signs: unknown): Promise<{ ok: boolean; error?: string }> {
  await requireRole("admin");
  const p = SignsSchema.safeParse(signs);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Those signs could not be saved." };
  const project = await prisma.videoProject.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return { ok: false, error: "That project no longer exists." };
  const key = printoutsKey(projectId);
  const value = JSON.stringify(p.data);
  await prisma.platformSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  return { ok: true };
}

/** Save a project's kit list — ticks, removals, added items, and who brings what. */
export async function saveKit(projectId: string, state: unknown): Promise<{ ok: boolean; error?: string }> {
  await requireRole("admin");
  const p = KitStateSchema.safeParse(state);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "That list could not be saved." };
  const project = await prisma.videoProject.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return { ok: false, error: "That project no longer exists." };
  const key = kitKey(projectId);
  const value = JSON.stringify(p.data);
  await prisma.platformSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  return { ok: true };
}

/** Save a project's prep-day tasks. */
export async function savePrep(projectId: string, tasks: unknown): Promise<{ ok: boolean; error?: string }> {
  await requireRole("admin");
  const p = PrepSchema.safeParse(tasks);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Those tasks could not be saved." };
  const project = await prisma.videoProject.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return { ok: false, error: "That project no longer exists." };
  const key = prepKey(projectId);
  const value = JSON.stringify(p.data);
  await prisma.platformSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  return { ok: true };
}
