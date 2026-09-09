/**
 * POST /api/admin/brain/notify — resend the ones that did not go out.
 *
 * Sending is normally part of asking: the flow is pick people, pick the
 * task, review the wording, press send — and that press does both. This
 * route exists for the leftover case, where the provider failed after
 * the asks were created, so nothing is stranded with no way to deliver
 * it. It never sends on its own; something still has to call it.
 *
 * GET — what is undelivered, so the page can offer to retry.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { mailConfigured } from "@/lib/mail";
import { dispatchPicks, undelivered } from "@/lib/brain/dispatch";
import { callNameOf } from "@/lib/brain/picker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ ids: z.array(z.string().min(1).max(100)).min(1).max(50) });

export async function GET() {
  const session = await requireRole("admin").catch(() => null);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!session || !userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await undelivered(userId).catch(() => []);
  return NextResponse.json({
    mailConfigured: mailConfigured(),
    pending: rows.map((r) => ({
      id: r.id,
      subject: r.subject,
      to: r.askedOf.email,
      name: callNameOf(r.askedOf.name, r.askedOf.preferredName, r.askedOf.email),
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await requireRole("admin").catch(() => null);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!session || !userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!mailConfigured()) {
    return NextResponse.json({ error: "Email is not configured on this environment." }, { status: 503 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Nothing selected to send." }, { status: 400 });

  const origin = process.env.NEXTAUTH_URL?.replace(/\/$/, "") ?? req.nextUrl.origin;
  const { sent, failed } = await dispatchPicks(parsed.data.ids, userId, origin);
  if (sent === 0 && failed.length === 0) {
    return NextResponse.json({ error: "Those have all been sent already." }, { status: 409 });
  }
  return NextResponse.json({ sent, failed });
}
