/**
 * POST /api/admin/training-week/innovation-confirmations
 *
 * Admin only. Sends the Innovation Ignited confirmation to everybody who
 * registered through that link and holds a decided seat (confirmed or
 * waitlisted) they have not been told about yet — for registrations made
 * before the form confirmed on registration, approved afterwards. A seat
 * already told is never sent again, so calling this twice is harmless.
 *
 * Returns: { results: [{ email, state }] }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { INNOVATION_IGNITED_SLUG } from "@/lib/formbuilder/innovation-ignited";
import { sendInnovationConfirmation } from "@/lib/training-week/innovation-confirmation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  // Only from this site's own pages: a sign-in cookie alone must not be enough to send mail.
  const origin = req.headers.get("origin");
  if (!origin || new URL(origin).host !== req.headers.get("host")) return NextResponse.json({ error: "Not from this site." }, { status: 403 });

  const form = await prisma.eventForm.findUnique({ where: { slug: INNOVATION_IGNITED_SLUG }, select: { id: true } });
  if (!form) return NextResponse.json({ results: [] });
  const seats = await prisma.workshopBooking.findMany({
    where: { submission: { formId: form.id }, status: { in: ["confirmed", "waitlist"] }, notifiedStatus: null },
    select: { id: true, submission: { select: { email: true, data: true } } },
    take: 200,
  });
  const by = (session.user as { name?: string | null; email?: string | null }).name || (session.user as { email?: string | null }).email || null;
  const results: { email: string | null; state: string }[] = [];
  for (const s of seats) {
    const r = await sendInnovationConfirmation(s.id, (s.submission?.data ?? {}) as Record<string, unknown>, s.submission?.email ?? null, by ?? undefined);
    results.push({ email: s.submission?.email ?? null, state: r.state });
  }
  return NextResponse.json({ results });
}
