/**
 * Workspace → Marketing → Social.
 *
 * The queue of posts drafted from live EQUIP cycles. Everything here is
 * a draft until a person approves it, and nothing on this platform can
 * publish to a network — the queue's job is to make the words and the
 * facts correct, and to stop a reminder going out with last month's
 * date on it.
 */
import { redirect } from "next/navigation";
import { Megaphone } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { FullWidthWhenCollapsed } from "@/components/workspace/FullWidthWhenCollapsed";
import { SocialQueue, type QueuePost } from "@/components/workspace/SocialQueue";
import { openCycles } from "@/lib/social/cycles";
import { REMINDER_LADDER } from "@/lib/social/types";

export const dynamic = "force-dynamic";

export default async function SocialPage() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");

  const now = new Date();
  const cycles = await openCycles(prisma, now);
  const byId = new Map(cycles.map((c) => [c.deadlineId, c]));

  const rows = await prisma.socialPost.findMany({
    where: { status: { in: ["draft", "approved", "scheduled"] } },
    orderBy: [{ scheduledFor: "asc" }],
    take: 60,
  });

  const posts: QueuePost[] = rows.map((r) => {
    const cycle = byId.get(r.deadlineId);
    return {
      id: r.id,
      kind: r.kind,
      status: r.status,
      cycleLabel: cycle?.cycleLabel ?? "Closed cycle",
      daysBefore: r.daysBefore,
      body: r.body,
      assetUrl: r.assetUrl,
      assetSpec: r.assetSpec,
      scheduledFor: r.scheduledFor.toISOString(),
      overdue: r.scheduledFor.getTime() < now.getTime(),
      /*
       * The one thing the queue knows that the post does not.
       *
       * An approved post is never regenerated — somebody read those
       * exact words and said yes. If the cycle's deadline has since
       * moved, the date inside it is wrong and only this comparison can
       * say so.
       */
      stale:
        r.status === "approved" &&
        cycle !== undefined &&
        r.kind === "reminder" &&
        Math.abs(
          cycle.deadlineAt.getTime() - r.daysBefore * 86_400_000 - r.scheduledFor.getTime(),
        ) > 36 * 3_600_000,
    };
  });

  return (
    <>
      <FullWidthWhenCollapsed />
      <PageHero
        eyebrow="Workspace · Marketing"
        title="Social"
        description={`Posts drafted from live EQUIP cycles — a launch, a ${REMINDER_LADDER.join("/")}-day reminder ladder, and the recipients announcement. Nothing has a date typed into it, so extending a deadline moves every unsent reminder with it. Approve a post, copy it, post it, mark it done.`}
        icon={<Megaphone />}
      />
      <div className="mt-6">
        <SocialQueue initial={posts} />
      </div>
    </>
  );
}
