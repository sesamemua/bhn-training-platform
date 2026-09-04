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
import { emailKey } from "@/lib/eligibility/email-key";

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
const IP_WINDOW_MS = 60_000;
const IP_MAX = 12;

/*
 * A second window, keyed by the ADDRESS rather than the caller.
 *
 * The per-IP limit is the weaker of the two: it lives in one instance's
 * memory, so it resets on a cold start and does nothing about a caller
 * spread across addresses or instances. Throttling the address as well
 * means that probing one person repeatedly is slow no matter where the
 * requests come from — which is the shape enumeration actually takes.
 *
 * Longer window, smaller count: a real registrant checks their own
 * address a couple of times, correcting a typo. Nobody legitimately
 * checks the same address twenty times in ten minutes.
 */
const ADDR_WINDOW_MS = 600_000;
const ADDR_MAX = 6;

const ipHits = new Map<string, number[]>();
const addrHits = new Map<string, number[]>();

function limited(map: Map<string, number[]>, key: string, windowMs: number, max: number, now: number): boolean {
  const recent = (map.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  map.set(key, recent);
  // Keep the map from growing without bound on a long-lived instance.
  if (map.size > 5000) {
    for (const [k, v] of map) if (v.every((t) => now - t >= windowMs)) map.delete(k);
  }
  return recent.length > max;
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const now = Date.now();
  if (limited(ipHits, ip, IP_WINDOW_MS, IP_MAX, now)) {
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

  /*
   * Throttled on the normalised key, so casing and whitespace cannot be
   * used to buy extra attempts at the same person.
   *
   * Being throttled is not a refusal, here or on the caller: the form
   * treats any non-200 as "carry on", and submit runs the same check
   * server-side. So burning an address's budget cannot lock a real
   * registrant out, and cannot get anybody past the gate either.
   */
  const key = emailKey(email);
  if (key && limited(addrHits, key, ADDR_WINDOW_MS, ADDR_MAX, now)) {
    return NextResponse.json(
      { error: "That address has been checked several times just now. Wait a moment." },
      { status: 429 },
    );
  }

  const verdict = await checkEligibility(email);
  /*
   * `blocked` and nothing else. The gate's own state used to ride along
   * as `enforcing`, which told an unauthenticated caller whether the
   * lists had been loaded at all — a fact about the programme's
   * operations that the form never reads.
   */
  return NextResponse.json({ blocked: verdict.blocked });
}
