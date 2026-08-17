/**
 * The newsletter content calendar.
 *
 *   GET  → cycles from this month onward, plus the current config
 *   POST → { action } — generate a span, edit config, send/skip a
 *          reminder, or record the approval
 *
 * Action-discriminated POST rather than REST verbs, matching the sibling
 * /api/workspace/newsletter/[id] route. Read is instructor+ (the leads
 * should be able to see their own deadlines); every write is admin, with
 * one deliberate exception: `approve`, which is gated on being the
 * configured approver rather than on a role, because the point of the
 * sign-off is that one specific person made it.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateCalendar, listCycles } from "@/lib/newsletter/calendar";
import { dispatchReminder } from "@/lib/newsletter/reminders";
import {
  getNewsletterConfig,
  isApprover,
  parseConfig,
  saveNewsletterConfig,
} from "@/lib/newsletter/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** First of the current month, in Toronto terms. */
function currentMonthIso(): string {
  const now = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  return `${now.slice(0, 7)}-01`;
}

function workshopUrl(req: NextRequest): string {
  const base =
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") || new URL(req.url).origin;
  return `${base}/admin/workspace/marketing/newsletter`;
}

export async function GET() {
  const session = await requireRole("instructor").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [cycles, config] = await Promise.all([
    listCycles(currentMonthIso()),
    getNewsletterConfig(),
  ]);
  const email = (session.user as { email?: string }).email ?? null;
  return NextResponse.json({
    ok: true,
    cycles,
    config,
    viewerIsApprover: isApprover(config, email),
  });
}

const GenerateSchema = z.object({
  action: z.literal("generate"),
  startMonth: z.string().regex(/^\d{4}-\d{2}$/),
  months: z.number().int().min(1).max(24),
});

const ConfigSchema = z.object({
  action: z.literal("saveConfig"),
  config: z.unknown(),
});

const ReminderSchema = z.object({
  action: z.enum(["sendReminder", "skipReminder", "setReminderMode"]),
  reminderId: z.string().min(1),
  mode: z.enum(["auto", "manual"]).optional(),
});

const ApproveSchema = z.object({
  action: z.literal("approve"),
  cycleId: z.string().min(1),
  note: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { action?: string } | null;
  if (!body?.action) return NextResponse.json({ error: "Missing action" }, { status: 400 });

  // ── approval: identity-gated, not role-gated ──────────────────────
  if (body.action === "approve") {
    const session = await requireRole("instructor").catch(() => null);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const parsed = ApproveSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const config = await getNewsletterConfig();
    const user = session.user as { email?: string; name?: string; id?: string };
    if (!isApprover(config, user.email)) {
      return NextResponse.json(
        { error: `Only ${config.approver.name} can approve an issue.` },
        { status: 403 },
      );
    }

    const cycle = await prisma.newsletterCycle.findUnique({ where: { id: parsed.data.cycleId } });
    if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
    if (cycle.approvedAt) {
      return NextResponse.json({ ok: true, alreadyApproved: true, cycle });
    }

    const updated = await prisma.newsletterCycle.update({
      where: { id: cycle.id },
      data: {
        status: "approved",
        approvedAt: new Date(),
        approvedById: user.id ?? null,
        approvedByName: user.name ?? user.email ?? null,
        approvalNote: parsed.data.note?.trim() || null,
      },
    });
    return NextResponse.json({ ok: true, cycle: updated });
  }

  // ── everything else is an admin action ────────────────────────────
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const userId = (session.user as { id?: string }).id ?? null;

  if (body.action === "generate") {
    const parsed = GenerateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    const [y, m] = parsed.data.startMonth.split("-").map(Number);
    const config = await getNewsletterConfig();
    const result = await generateCalendar({
      startYear: y,
      startMonth: m,
      months: parsed.data.months,
      config,
      createdById: userId,
    });
    const cycles = await listCycles(currentMonthIso());
    return NextResponse.json({
      ok: true,
      created: result.created,
      updated: result.updated,
      frozen: result.frozen,
      cycles,
    });
  }

  if (body.action === "saveConfig") {
    const parsed = ConfigSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    const config = await saveNewsletterConfig(parseConfig(parsed.data.config));
    return NextResponse.json({ ok: true, config });
  }

  if (body.action === "sendReminder" || body.action === "skipReminder" || body.action === "setReminderMode") {
    const parsed = ReminderSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    if (parsed.data.action === "skipReminder") {
      await prisma.newsletterReminder.updateMany({
        where: { id: parsed.data.reminderId, status: "pending" },
        data: { status: "skipped", error: null },
      });
      const cycles = await listCycles(currentMonthIso());
      return NextResponse.json({ ok: true, cycles });
    }

    if (parsed.data.action === "setReminderMode") {
      if (!parsed.data.mode) return NextResponse.json({ error: "Missing mode" }, { status: 400 });
      await prisma.newsletterReminder.update({
        where: { id: parsed.data.reminderId },
        data: { mode: parsed.data.mode },
      });
      const cycles = await listCycles(currentMonthIso());
      return NextResponse.json({ ok: true, cycles });
    }

    const config = await getNewsletterConfig();
    const result = await dispatchReminder({
      reminderId: parsed.data.reminderId,
      config,
      workshopUrl: workshopUrl(req),
      sentById: userId,
    });
    const cycles = await listCycles(currentMonthIso());
    return NextResponse.json({ ok: true, result, cycles });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
