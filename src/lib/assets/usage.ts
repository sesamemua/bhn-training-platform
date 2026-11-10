/**
 * The light half of the asset library: public URLs and "Used in" links.
 * Kept apart from ./store (sharp, AI, server-only) so feature routes can
 * record usage without pulling the image pipeline in.
 */
import { prisma } from "@/lib/prisma";
import { r2PublicUrl } from "@/lib/r2";

export const assetUrl = (key: string | null | undefined) => (key ? r2PublicUrl(key) : null);

export interface UsageTarget { targetType: string; targetId: string; label: string; href?: string | null }

/** This target now shows this asset (and no other asset in the same slot). null clears it. */
export async function setUsage(assetId: string | null, t: UsageTarget) {
  await prisma.assetUsage.deleteMany({ where: { targetType: t.targetType, targetId: t.targetId, ...(assetId ? { NOT: { assetId } } : {}) } });
  if (!assetId) return;
  await prisma.assetUsage.upsert({
    where: { assetId_targetType_targetId: { assetId, targetType: t.targetType, targetId: t.targetId } },
    update: { label: t.label, href: t.href ?? null },
    create: { assetId, ...t, href: t.href ?? null },
  });
}
