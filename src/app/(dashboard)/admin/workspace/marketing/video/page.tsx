/**
 * Workspace → Marketing → Video Production. Admin-only list of video projects.
 */
import { redirect } from "next/navigation";
import { Clapperboard } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { VideoProjectsClient } from "@/components/workspace/VideoProjectsClient";
import { costGroupsFor, lunchGuestsKey, parseLunchGuests, totals } from "@/lib/video/production-cost";
import { scriptsHref } from "@/lib/video/paths";
import { ensureBhnPromoProject } from "@/lib/scripts/seed";

export const dynamic = "force-dynamic";

export default async function VideoProductionPage() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");

  // The BHN Promo Video project is always present (no manual seed step).
  // The 2026 Symposium comms plan is not a video — it has its own tab.
  const meId = (session.user as { id?: string }).id ?? null;
  await ensureBhnPromoProject(meId);

  const projects = await prisma.videoProject.findMany({
    where: { category: "marketing", isArchived: false },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { scripts: { where: { isArchived: false } }, callSheets: true } },
      callSheets: { where: { shootDate: { not: null } }, orderBy: { shootDate: "asc" }, select: { shootDate: true } },
      scripts: { where: { isArchived: false }, orderBy: { order: "asc" }, select: { id: true, title: true }, take: 2 },
    },
  });
  const today = new Date().toISOString().slice(0, 10);
  const lunch = await prisma.platformSetting.findMany({
    where: { key: { in: projects.map((p) => lunchGuestsKey(p.id)) } },
    select: { key: true, value: true },
  });
  const lunchFor = (id: string) => parseLunchGuests(lunch.find((r) => r.key === lunchGuestsKey(id))?.value);
  const data = projects.map((p) => {
    const dates = p.callSheets.map((c) => c.shootDate!.toISOString().slice(0, 10));
    const groups = costGroupsFor(p.title, lunchFor(p.id));
    return {
      id: p.id,
      title: p.title,
      summary: p.summary,
      status: p.status,
      scriptCount: p._count.scripts,
      scriptsHref: scriptsHref(p.id, p.scripts.map((s) => s.id)),
      firstScript: p.scripts[0]?.title ?? "",
      callSheetCount: p._count.callSheets,
      // The next shoot day still ahead, else the last one there was.
      shootDate: dates.find((d) => d >= today) ?? dates.at(-1) ?? "",
      budget: groups ? totals(groups).total : null,
      updatedAt: p.updatedAt.toISOString(),
    };
  });

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={<><Clapperboard size={11} /> Workspace · Marketing</>}
        title="Video Production"
        description="Each project has its scripts, call sheets and production cost. Scripts can be shared for collaborative editing — contributors don't need an account."
      />
      <VideoProjectsClient initialProjects={data} />
    </div>
  );
}
