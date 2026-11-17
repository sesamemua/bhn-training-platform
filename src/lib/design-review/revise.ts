import { prisma } from "@/lib/prisma";
import { archiveDesignRound } from "./versions";
import { pagesOf, type Page } from "./types";

export async function reviseDesignArtwork(id: string, pages: Page[], fields: { sourceName?: string; title?: string; description?: string }) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.designArtwork.findUnique({ where: { id }, select: { round: true, pages: true, versions: true, updatedAt: true } });
    if (!current) return false;
    const result = await tx.designArtwork.updateMany({
      where: { id, updatedAt: current.updatedAt, round: current.round },
      data: { ...fields, pages, versions: archiveDesignRound(current), lockedAt: null,
        round: current.round + (pagesOf(current.pages).length ? 1 : 0),
        approval: "pending", approvalById: null, approvalAt: null, approvalNote: "" },
    });
    if (!result.count) return false;
    await tx.designReview.updateMany({ where: { artworkId: id }, data: { viewedAt: null, okAt: null, requestedAt: null, requestedByName: null } });
    return true;
  });
}
