/**
 * POST /api/eligibility/request  { email, name? } → { ok }
 *
 * The button under "we can't find that address": it tells the
 * coordinators, and the registrant carries on filling the form.
 *
 * Nobody is refused any more, so this is not an appeal — it is a
 * flag. The registration itself lands either way, carrying
 * `__eligibility: "not_matched"`; this is what makes somebody look at
 * it before seats are offered rather than after.
 *
 * Says nothing back about whether the address is on a list, which is
 * the enumeration rule the check endpoint is written around: the reply
 * is the same whoever asks.
 */
import { NextRequest, NextResponse } from "next/server";
import { emailKey } from "@/lib/eligibility/email-key";
import { callerIp, limited } from "@/lib/eligibility/limit";
import { mailConfigured, sendMail } from "@/lib/mail";

export const runtime = "nodejs";

/* Tighter than the check: pressing a button is a deliberate act, and
 * one person has no reason to do it more than a handful of times. */
const IP_WINDOW_MS = 600_000;
const IP_MAX = 8;
const ADDR_WINDOW_MS = 86_400_000;
const ADDR_MAX = 3;

const TEAM = process.env.SMTP_FROM_EMAIL ?? "info@biohubnet.ca";

export async function POST(req: NextRequest) {
  const now = Date.now();
  if (limited("request-ip", callerIp(req.headers), IP_WINDOW_MS, IP_MAX, now)) {
    return NextResponse.json({ error: "Too many messages from here. Try again shortly." }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as { email?: unknown; name?: unknown };
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 160) : "";
  const key = emailKey(email);
  if (!key) return NextResponse.json({ error: "That is not an email address." }, { status: 400 });

  /*
   * Quietly ok past the per-address limit, not an error.
   *
   * Somebody who presses it twice has been told twice that we know; an
   * error would read as "your message failed" and send them looking for
   * another way to reach us.
   */
  if (limited("request-addr", key, ADDR_WINDOW_MS, ADDR_MAX, now)) {
    return NextResponse.json({ ok: true });
  }

  if (mailConfigured()) {
    const when = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Toronto", dateStyle: "long", timeStyle: "short",
    }).format(new Date());
    await sendMail({
      to: TEAM,
      replyTo: email,
      subject: `Training Week: ${email} is not on the eligibility lists`,
      text:
        `${name || "Someone"} registered for Training Week with ${email}, which is not on any programme list.\n\n` +
        `They pressed "Tell us" on the form at ${when}, meaning they believe they were accepted into ENGAGE or ` +
        `EXPERIENCE, or applied to EQUIP, after the lists were last updated.\n\n` +
        `Their registration goes through either way and is marked "not on the list" in Training admin. ` +
        `To settle it: Admin → Eligibility lists → Add someone by hand, or re-import the programme list.\n` +
        `https://bhn-training-platform.vercel.app/admin/eligibility\n`,
    }).catch(() => {
      // A send that fails must not tell the registrant their message
      // vanished: the registration still carries the flag, which is the
      // record that actually matters.
    });
  }

  return NextResponse.json({ ok: true });
}
