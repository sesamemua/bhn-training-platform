/**
 * Flow charts — list, create, save, delete.
 *
 * Read is instructor+ (a program lead should be able to follow a process
 * they take part in); every write is admin. The document is re-parsed
 * server-side on save, so a client cannot store a shape the renderer
 * would choke on.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ChartSchema, parseChart } from "@/lib/flowchart/types";
import { TRAINING_WEEK_FLOW } from "@/lib/flowchart/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "chart";

export async function GET() {
  const session = await requireRole("instructor").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let charts = await prisma.flowChart.findMany({ orderBy: { updatedAt: "desc" } });

  // First visit on an empty table opens the real process rather than a
  // blank canvas — a flow-chart tool with nothing in it teaches nothing.
  if (charts.length === 0) {
    await prisma.flowChart.create({
      data: {
        title: "Training Week registration",
        slug: "training-week-registration",
        summary: "How a person gets a seat, from opening to attending.",
        data: TRAINING_WEEK_FLOW as unknown as object,
      },
    });
    charts = await prisma.flowChart.findMany({ orderBy: { updatedAt: "desc" } });
  }

  return NextResponse.json({
    ok: true,
    charts: charts.map((c) => ({ ...c, data: parseChart(c.data) })),
  });
}

const CreateSchema = z.object({
  action: z.literal("create"),
  title: z.string().trim().min(2).max(80),
});

const SaveSchema = z.object({
  action: z.literal("save"),
  id: z.string().min(1),
  title: z.string().trim().min(2).max(80).optional(),
  summary: z.string().trim().max(160).optional(),
  data: ChartSchema,
});

const ResetSchema = z.object({
  action: z.literal("resetToTemplate"),
  id: z.string().min(1),
});

const DeleteSchema = z.object({
  action: z.literal("delete"),
  id: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const userId = (session.user as { id?: string }).id ?? null;

  const body = (await req.json().catch(() => null)) as { action?: string } | null;
  if (!body?.action) return NextResponse.json({ error: "Missing action" }, { status: 400 });

  if (body.action === "create") {
    const p = CreateSchema.safeParse(body);
    if (!p.success) return NextResponse.json({ error: "Give the chart a name." }, { status: 400 });
    let slug = slugify(p.data.title);
    if (await prisma.flowChart.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    const chart = await prisma.flowChart.create({
      data: { title: p.data.title, slug, data: { nodes: [], edges: [] }, createdById: userId },
    });
    return NextResponse.json({ ok: true, id: chart.id });
  }

  if (body.action === "save") {
    const p = SaveSchema.safeParse(body);
    if (!p.success) return NextResponse.json({ error: "That chart could not be saved." }, { status: 400 });
    await prisma.flowChart.update({
      where: { id: p.data.id },
      data: {
        ...(p.data.title ? { title: p.data.title } : {}),
        ...(p.data.summary !== undefined ? { summary: p.data.summary || null } : {}),
        data: parseChart(p.data.data) as unknown as object,
        updatedById: userId,
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "resetToTemplate") {
    // The seed only fires on an empty table, so a chart created before the
    // template gained new question types stays stale forever with no way
    // back short of deleting the row. This is that way back.
    const p = ResetSchema.safeParse(body);
    if (!p.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    await prisma.flowChart.update({
      where: { id: p.data.id },
      data: { data: TRAINING_WEEK_FLOW as unknown as object, updatedById: userId },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "delete") {
    const p = DeleteSchema.safeParse(body);
    if (!p.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    await prisma.flowChart.delete({ where: { id: p.data.id } }).catch(() => null);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
