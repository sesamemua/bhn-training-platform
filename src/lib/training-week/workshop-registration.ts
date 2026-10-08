"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StatusMapSchema, WORKSHOP_STATUS_KEY, parseStatusMap, switchable } from "./workshop-status";
import { REGISTRATION_FORM_SLUG, REGISTRATION_FORM_SLUG_V2 } from "@/lib/allocation/symposium-2026";

export async function saveWorkshopRegistration(slug: string, state: string): Promise<{ ok: boolean; problem?: string }> {
  await requireRole("admin");
  if (typeof slug !== "string" || !switchable().some((s) => s.slug === slug)) return { ok: false, problem: "Unknown workshop." };
  const parsed = StatusMapSchema.safeParse({ [slug]: { state, message: "" } });
  if (!parsed.success) return { ok: false, problem: "Invalid registration state." };
  try {
    // Merge only this session, without overwriting another coordinator's changes.
    await prisma.$transaction(async (tx) => {
      const stored = await tx.platformSetting.findUnique({ where: { key: WORKSHOP_STATUS_KEY } });
      const map = parseStatusMap(stored?.value);
      map[slug] = parsed.data[slug];
      const value = JSON.stringify(map);
      await tx.platformSetting.upsert({ where: { key: WORKSHOP_STATUS_KEY }, create: { key: WORKSHOP_STATUS_KEY, value }, update: { value } });
    }, { isolationLevel: "Serializable" });
  } catch {
    return { ok: false, problem: "Not saved. Refresh and try again; another coordinator may have changed registration." };
  }
  for (const path of ["/dashboard", "/admin/workspace/training-admin", `/apply/${REGISTRATION_FORM_SLUG}`, `/apply/${REGISTRATION_FORM_SLUG_V2}`]) revalidatePath(path);
  return { ok: true };
}
