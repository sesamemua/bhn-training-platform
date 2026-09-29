/**
 * POST /api/public/training-week/withdraw   { token, bookingId, reason }
 *
 * "I can't make it", from a registrant's pass. The pass code is the
 * authorisation — there is no account — and it only reaches seats on
 * its own registration. A reason is required; see withdrawSeat.
 */
import { NextRequest, NextResponse } from "next/server";
import { callerIp, limited } from "@/lib/eligibility/limit";
import { withdrawSeat } from "@/lib/training-week/pass";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (limited("tw-withdraw-ip", callerIp(req.headers), 10 * 60_000, 10, Date.now())) {
    return NextResponse.json({ error: "Too many tries from here. Please wait a few minutes." }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) as { token?: unknown; bookingId?: unknown; reason?: unknown };
  const token = typeof body.token === "string" ? body.token : "";
  const bookingId = typeof body.bookingId === "string" ? body.bookingId : "";
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token) || !/^[a-z0-9]{10,40}$/i.test(bookingId)) {
    return NextResponse.json({ error: "This link is not valid." }, { status: 400 });
  }
  const r = await withdrawSeat({ token, bookingId, reason: typeof body.reason === "string" ? body.reason : "" });
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.problem }, { status: 400 });
}
