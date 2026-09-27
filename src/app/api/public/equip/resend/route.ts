/**
 * POST /api/public/equip/resend   { email } | { token }
 *
 * "Email me my link." The way back into a public draft for somebody who
 * no longer has the tab it was started in.
 *
 *   { token } — from inside the draft: send this draft's link again.
 *   { email } — from the start page: send the link of every unsubmitted
 *               draft started with this address.
 *
 * The reply never says whether an address has a draft. Anything else
 * would make this a way to find out who has applied for funding — so it
 * is the same "if there is one, it is on its way" whoever asks, and the
 * only person who learns the answer is the owner of the inbox.
 *
 * Sending again repeats the original deadline; it never grants a new
 * two weeks (see sendDraftLink).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { callerIp, limited } from "@/lib/eligibility/limit";
import { NOTICE_SELECT, sendDraftLink } from "@/lib/equip/draft-notice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SAME = { ok: true, message: "If there is an unsubmitted application for that address, its link is on its way." };

export async function POST(req: NextRequest) {
  const now = Date.now();
  if (limited("equip-resend-ip", callerIp(req.headers), 10 * 60_000, 6, now)) {
    return NextResponse.json({ error: "Too many requests from here. Try again in a few minutes." }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as { email?: unknown; token?: unknown };
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().slice(0, 200) : "";

  if (token) {
    if (token.length < 20) return NextResponse.json({ error: "That link is not valid." }, { status: 400 });
    const app = await prisma.equipApplication.findUnique({ where: { publicToken: token }, select: NOTICE_SELECT });
    if (!app) return NextResponse.json({ error: "This link is no longer active." }, { status: 404 });
    // Whoever holds the token can already see the draft, so saying what
    // happened here gives nothing away.
    if (limited("equip-resend-app", app.id, 60 * 60_000, 3, now)) {
      return NextResponse.json({ ok: true, message: `We have already sent it to ${app.applicantEmail} — check that inbox, including junk.` });
    }
    const r = await sendDraftLink(app);
    return NextResponse.json(
      r.sent
        ? { ok: true, message: `Sent to ${app.applicantEmail}.`, expiresAt: r.expiresAt }
        : { ok: false, message: "We could not send it just now. Bookmark this page instead." },
    );
  }

  if (!EMAIL.test(email)) return NextResponse.json({ error: "That doesn't look like an email address." }, { status: 400 });
  // Per address as well as per caller, so nobody can fill an inbox.
  if (limited("equip-resend-addr", email.toLowerCase(), 60 * 60_000, 3, now)) return NextResponse.json(SAME);

  const drafts = await prisma.equipApplication.findMany({
    where: { status: "draft", userId: null, publicToken: { not: null }, applicantEmail: { equals: email, mode: "insensitive" } },
    select: NOTICE_SELECT,
    orderBy: { updatedAt: "desc" },
    take: 5,
  });
  for (const d of drafts) await sendDraftLink(d).catch(() => null);
  return NextResponse.json(SAME);
}
