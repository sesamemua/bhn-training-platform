/**
 * POST /api/eligibility/check  { email } → { enforcing, blocked }
 *
 * The inline check behind the Training Week email question, so somebody
 * finds out they are not on the list at the question that decides it,
 * rather than after filling in ten more.
 *
 * This is an ENUMERATION ORACLE and is written as one deliberately
 * contained:
 *   • It answers only "blocked or not". Never which list matched, never
 *     the programme — those are in the verdict and are dropped here.
 *     Naming the list would turn the form into a way to find out who
 *     applied to EQUIP by typing addresses at it.
 *   • It is rate limited per IP (below).
 *   • It decides nothing. The submit action runs the same check again
 *     server-side; this endpoint only changes WHEN somebody is told.
 *     A caller who skips it gains nothing.
 */
import { NextRequest, NextResponse } from "next/server";
import { checkEligibility } from "@/lib/eligibility/check";

export const runtime = "nodejs";

/*
 * Per-IP sliding window, in memory.
 *
 * Honest about what this is: serverless means one map per warm
 * instance, so it is a speed bump rather than a wall. It still turns
 * "paste in a wordlist" into something slow and conspicuous, and the
 * endpoint leaks one bit per call at best. A shared store would be
 * better and is not worth a Redis dependency for this.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 12;
const hits = new Map<string, number[]>();

function rateLimited(ip: string, now: number): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  // Keep the map from growing without bound on a long-lived instance.
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
  }
  return recent.length > MAX_PER_WINDOW;
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  if (rateLimited(ip, Date.now())) {
    // Not "blocked": being throttled is not the same as not being on
    // the list, and telling somebody they are ineligible because they
    // retyped their address would be a lie.
    return NextResponse.json(
      { error: "Too many checks from here. Wait a minute and try again." },
      { status: 429 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { email?: unknown };
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) return NextResponse.json({ error: "No address given." }, { status: 400 });

  const verdict = await checkEligibility(email);
  return NextResponse.json({ enforcing: verdict.gate.enforcing, blocked: verdict.blocked });
}
