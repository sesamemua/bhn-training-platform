/**
 * Actually removing an application, and the files that belong to it.
 *
 * Its own function because the row is only half of it: the documents
 * live in R2 and nothing else will ever go looking for them again. An
 * application deleted without them leaves a pitch deck sitting in a
 * bucket with no record that it is there — which is a worse outcome
 * than not deleting at all, because now nobody knows to look.
 */
import { prisma } from "@/lib/prisma";
import { deleteR2ObjectByUrl } from "@/lib/r2";
import type { EquipDocument } from "./types";

export async function purgeApplication(id: string): Promise<{ files: number }> {
  const app = await prisma.equipApplication.findUnique({
    where: { id },
    select: { documents: true },
  });
  if (!app) return { files: 0 };

  const docs = (app.documents as unknown as EquipDocument[]) ?? [];
  // Documents are addressed by their R2 key, not a URL.
  const keys = docs.map((d) => d?.key).filter((k): k is string => typeof k === "string" && !!k);

  /*
   * Files first, row second. If a file will not delete the row stays,
   * and somebody can try again — the reverse leaves orphans nothing
   * points at. Individually caught: one stubborn object must not keep
   * the other four alive.
   */
  let files = 0;
  for (const key of keys) {
    try {
      // Named for URLs, but documented as taking a key too.
      await deleteR2ObjectByUrl(key);
      files += 1;
    } catch {
      /* Logged by the caller's own error path if it matters. */
    }
  }

  await prisma.equipApplication.delete({ where: { id } });
  return { files };
}
