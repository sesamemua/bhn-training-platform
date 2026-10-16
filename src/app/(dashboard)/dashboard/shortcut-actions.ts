"use server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { ShortcutPrefsSchema, type ShortcutPrefs } from "@/lib/page-usage";

/** Saves the signed-in user's own dashboard shortcuts (pins, names, hidden pages). */
export async function saveShortcuts(input: ShortcutPrefs): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireSession();
  const userId = (session.user as { id?: string }).id;
  if (!userId) return { ok: false, error: "Sign in again to save your shortcuts." };
  const parsed = ShortcutPrefsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Those shortcuts could not be saved." };
  const key = `dashboard.shortcuts.v1.${userId}`;
  const value = JSON.stringify(parsed.data);
  await prisma.platformSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  return { ok: true };
}
