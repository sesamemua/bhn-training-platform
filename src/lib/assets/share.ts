/**
 * What a share link may show: the collection's pictures (or, for a smart
 * collection, what its saved search matches now), never anything trashed,
 * refused consent, or past its licence.
 */
import { prisma } from "@/lib/prisma";
import { SmartQuery } from "./core";

export async function sharedCollection(token: string) {
  if (!/^[\w-]{16,64}$/.test(token)) return null;
  const c = await prisma.assetCollection.findUnique({ where: { shareToken: token } });
  if (!c || !c.shareExpiresAt || c.shareExpiresAt <= new Date()) return null;
  return c;
}

export async function sharedAssetIds(token: string): Promise<string[] | null> {
  const c = await sharedCollection(token);
  if (!c) return null;
  const smart = c.query ? SmartQuery.safeParse(c.query) : null;
  const q = smart?.success ? smart.data : null;
  const rows = await prisma.asset.findMany({
    where: {
      deletedAt: null, key: { not: "" }, consent: { not: "refused" },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      ...(q ? {
        ...(q.folder ? { folder: q.folder } : {}), ...(q.tag ? { tags: { has: q.tag } } : {}),
        ...(q.consent ? { consent: q.consent } : {}), ...(q.origin ? { origin: q.origin } : {}),
        ...(q.q ? { OR: [{ title: { contains: q.q, mode: "insensitive" as const } }, { caption: { contains: q.q, mode: "insensitive" as const } }, { tags: { has: q.q.toLowerCase() } }] } : {}),
      } : { id: { in: c.assetIds } }),
    },
    select: { id: true }, take: 400, orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => r.id);
}
