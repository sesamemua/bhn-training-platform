"use server";

/** Saves a project's lunch list (Production cost → Catering). Admin-only. */
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lunchGuestsKey } from "@/lib/video/production-cost";
import { VIDEO_BASE, productionCostPath } from "@/lib/video/paths";

export async function setLunchGuests(projectId: string, names: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole("admin");
  const project = await prisma.videoProject.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return { ok: false, error: "That project no longer exists." };
  const clean = [...new Set(names.map((n) => String(n).trim().slice(0, 60)).filter(Boolean))].slice(0, 100);
  const key = lunchGuestsKey(projectId);
  const value = JSON.stringify(clean);
  await prisma.platformSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  revalidatePath(productionCostPath(projectId));
  revalidatePath(VIDEO_BASE);
  return { ok: true };
}
