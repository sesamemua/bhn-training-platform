/**
 * Workspace → Flow charts. Draw a process, drag it around, save it.
 *
 * Seeded on first open with the Training Week registration flow, so the
 * tool arrives with the real process in it rather than a blank canvas.
 */
import { redirect } from "next/navigation";
import { Workflow } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { FlowChartEditor, type ChartRecord } from "@/components/workspace/FlowChartEditor";
import { parseChart } from "@/lib/flowchart/types";
import { TRAINING_WEEK_FLOW } from "@/lib/flowchart/seed";

export const dynamic = "force-dynamic";

export default async function FlowChartsPage() {
  const session = await requireRole("instructor").catch(() => null);
  if (!session) redirect("/dashboard");
  const role = (session.user as { role?: string }).role ?? "user";
  const canEdit = role === "admin" || role === "superadmin";

  let rows = await prisma.flowChart.findMany({ orderBy: { updatedAt: "desc" } });
  if (rows.length === 0) {
    await prisma.flowChart
      .create({
        data: {
          title: "Training Week registration",
          slug: "training-week-registration",
          summary: "How a person gets a seat, from opening to attending.",
          data: TRAINING_WEEK_FLOW as unknown as object,
        },
      })
      .catch(() => null);
    rows = await prisma.flowChart.findMany({ orderBy: { updatedAt: "desc" } });
  }

  const charts: ChartRecord[] = rows.map((c) => ({
    id: c.id,
    title: c.title,
    slug: c.slug,
    summary: c.summary,
    data: parseChart(c.data),
    updatedAt: c.updatedAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={<><Workflow size={11} /> Workspace</>}
        title="Flow charts"
        description="Draw how a process actually runs. Drag the boxes, connect them, rename anything."
      />
      <FlowChartEditor charts={charts} canEdit={canEdit} />
    </div>
  );
}
