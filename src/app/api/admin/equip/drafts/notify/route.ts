/**
 * POST /api/admin/equip/drafts/notify
 *
 * Email every public EQUIP draft that has never been told its link.
 *
 * Drafts started before the link was emailed automatically have no way
 * back but the tab they were started in, and no deadline — nothing is
 * removed that its owner was not told about. This sends them the same
 * letter a new draft gets on starting, which starts their two weeks.
 *
 * Admin-only and deliberate: it writes to real applicants, so the page
 * asks before calling it and says how many.
 */
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NOTICE_SELECT, sendDraftLink } from "@/lib/equip/draft-notice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const me = await requireRole("admin").catch(() => null);
  if (!me) return NextResponse.json({ error: "You need to be signed in as an admin." }, { status: 403 });

  const untold = await prisma.equipApplication.findMany({
    where: { status: "draft", userId: null, publicToken: { not: null }, draftNoticeSentAt: null },
    select: NOTICE_SELECT,
    take: 200,
  });
  let sent = 0, failed = 0;
  for (const d of untold) {
    const r = await sendDraftLink(d).catch(() => ({ sent: false }));
    if (r.sent) sent += 1; else failed += 1;
  }
  const actorId = (me.user as { id?: string }).id;
  if (actorId) {
    await prisma.auditLog.create({
      data: { action: "equip.drafts_notified", actorId, detail: JSON.stringify({ sent, failed }) },
    }).catch(() => null);
  }
  return NextResponse.json({ ok: true, sent, failed });
}
