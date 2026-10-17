import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { openCycles } from "./cycles";
import { socialQueueItem, type SocialQueueSnapshot } from "./dashboard";

export async function loadSocialDashboard(now: Date): Promise<SocialQueueSnapshot> {
  const cycles = await openCycles(prisma, now);
  const recentWhere: Prisma.SocialPostWhereInput = { status: "published", publishedAt: { gte: new Date(now.getTime() - 48 * 60 * 60_000), lte: now } };
  const scheduledWhere: Prisma.SocialPostWhereInput = { status: "scheduled", bufferPostId: { not: null }, scheduledFor: { gt: now } };
  const nextWhere: Prisma.SocialPostWhereInput = { OR: [
    { status: { in: ["draft", "approved"] }, OR: [{ stream: { not: "venture_connect" } }, { kind: "recipients" }, { deadlineId: { in: cycles.map(c => c.deadlineId) } }] },
    { status: "publishing" },
    { status: "scheduled", OR: [{ bufferPostId: null }, { scheduledFor: { lte: now } }] },
  ] };
  const select = { id: true, body: true, assetSpec: true, status: true, scheduledFor: true, publishedAt: true, bufferPostId: true, publishError: true } as const;
  const [recent, publishedCount, scheduled, scheduledCount, next, dueCount] = await Promise.all([
    prisma.socialPost.findMany({ where: recentWhere, select, orderBy: [{ publishedAt: "desc" }, { id: "asc" }], take: 2 }),
    prisma.socialPost.count({ where: recentWhere }),
    prisma.socialPost.findMany({ where: scheduledWhere, select, orderBy: [{ scheduledFor: "asc" }, { id: "asc" }], take: 2 }),
    prisma.socialPost.count({ where: scheduledWhere }),
    prisma.socialPost.findMany({ where: nextWhere, select, orderBy: [{ scheduledFor: "asc" }, { id: "asc" }], take: 2 }),
    prisma.socialPost.count({ where: { AND: [nextWhere, { scheduledFor: { lte: now } }] } }),
  ]);
  return { recent: recent.map(p => socialQueueItem(p, now)), publishedCount, scheduled: scheduled.map(p => socialQueueItem(p, now)), scheduledCount,
    next: next.map(p => socialQueueItem(p, now)), dueCount };
}
