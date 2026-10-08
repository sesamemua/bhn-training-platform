/**
 * POST /api/public/training-week/self-check-in   { token, bookingId }
 *
 * Somebody checks themselves in from their reminder. The pass code is
 * the authorisation and only reaches seats on its own registration; the
 * window (30 minutes before the start, until the end) is decided in
 * selfCheckInSeat.
 */
import { NextRequest, NextResponse } from "next/server";
import { callerIp, limited } from "@/lib/eligibility/limit";
import { selfCheckInSeat } from "@/lib/training-week/pass";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (limited("tw-self-check-in-ip", callerIp(req.headers), 10 * 60_000, 30, Date.now())) {
    return NextResponse.json({ error: "Too many tries from here. Please wait a few minutes." }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) as { token?: unknown; bookingId?: unknown };
  const token = typeof body.token === "string" ? body.token : "";
  const bookingId = typeof body.bookingId === "string" ? body.bookingId : "";
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token) || !/^[a-z0-9]{10,40}$/i.test(bookingId)) {
    return NextResponse.json({ error: "This link is not valid." }, { status: 400 });
  }
  const r = await selfCheckInSeat({ token, bookingId });
  return NextResponse.json({ state: r.state, at: r.at?.toISOString() ?? null }, { status: r.state === "unknown" ? 404 : 200 });
}
