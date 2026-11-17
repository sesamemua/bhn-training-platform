import { prisma } from "@/lib/prisma";

export type ReviewSend = { id: string; to: string; by: string; round: number | null; at: string };

/** Call only after checking access to the review being requested. */
export async function reviewSentHistory(action: string, targetId: string): Promise<ReviewSend[]> {
  const rows = await prisma.auditLog.findMany({
    where: { action, targetId }, orderBy: { createdAt: "desc" }, take: 100,
    select: { id: true, detail: true, createdAt: true, actor: { select: { name: true } } },
  });
  const entries = rows.flatMap((row) => {
    try {
      const detail = JSON.parse(row.detail ?? "{}") as { recipientId?: string; recipientEmail?: string; round?: number };
      return detail.recipientId ? [{ row, detail }] : [];
    } catch { return []; }
  });
  const ids = [...new Set(entries.flatMap(({ detail }) => detail.recipientId ? [detail.recipientId] : []))];
  const names = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const nameById = new Map(names.map((u) => [u.id, u.name]));
  return entries.map(({ row, detail }) => ({
    id: row.id, at: row.createdAt.toISOString(), by: row.actor.name || "Team member",
    to: nameById.get(detail.recipientId ?? "") || detail.recipientEmail || "Team member",
    round: typeof detail.round === "number" ? detail.round : null,
  }));
}
