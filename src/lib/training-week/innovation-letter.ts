/**
 * The Innovation Ignited confirmation, as words.
 *
 * Innovation Ignited is open to anyone and approves on registration, so
 * this letter is the whole of what a registrant hears: their seat, when
 * and where, a withdraw button, and — played back so they can correct
 * it — the dietary needs and allergies they told us. A full room puts
 * them on the waitlist instead, and the letter says so.
 *
 * Pure module: no Prisma, no mail.
 */
import { cancelLabel } from "@/lib/allocation/person-letter";

export const DIET_NONE = "No dietary requirements";
const isOther = (o: string) => /^other\b/i.test(o.trim());

/** What they told us on the shared dietary question (and its "Tell us about it" box), in one line. */
export function dietarySaid(answers: Record<string, unknown>): string | null {
  const picked = Array.isArray(answers.dietary) ? answers.dietary.filter((o): o is string => typeof o === "string") : [];
  const other = typeof answers.dietary_other === "string" ? answers.dietary_other.trim() : "";
  const named = picked.filter((o) => o !== DIET_NONE && !isOther(o));
  const all = [...named, ...(other ? [other] : [])];
  return all.length ? all.join("; ") : null;
}

const tz = "America/Toronto";
const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(d);
const clock = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

export function innovationLetter(p: {
  name: string;
  status: "confirmed" | "waitlist";
  session: string;
  start: Date;
  end: Date;
  venue: string | null;
  cantAttendLink?: string;
  dietary: string | null;
}): { subject: string; body: string; buttons: { url: string; label: string }[] } {
  const first = p.name.trim().split(/\s+/)[0] || "there";
  const when = `${day(p.start)}, ${clock(p.start)}–${clock(p.end)}`;
  // The session, its place and its withdraw link, kept together: the email draws them as one row.
  const row = [
    `  • ${p.session} — ${when}`,
    ...(p.venue ? [`    ${p.venue}`] : []),
    ...(p.status === "confirmed" && p.cantAttendLink ? [`    ${cancelLabel()}: ${p.cantAttendLink}`] : []),
  ];
  const out: string[] = [`Hello ${first},`, ""];
  if (p.status === "confirmed") {
    out.push(`Your seat at ${p.session} is confirmed:`, ...row, "");
  } else {
    out.push(`${p.session} is full, so you are on the waitlist:`, ...row, "", "If a place becomes available, we will write to you. You do not need to do anything.", "");
  }
  out.push(
    p.dietary
      ? `Dietary requirements and allergies you told us about: ${p.dietary}. If this is wrong or has changed, reply to this email.`
      : "Dietary requirements and allergies: none. If you have any, reply to this email.",
    "",
  );
  if (p.status === "confirmed") {
    out.push("A calendar file is attached. You don't need to reply otherwise.", "");
    if (p.cantAttendLink) out.push("If you can't make it, use the withdraw button above so the place can go to somebody else.", "");
  }
  out.push("The BioHubNet team");
  return {
    subject: p.status === "confirmed"
      ? `You're registered: ${p.session}, ${day(p.start)}`
      : `You're on the waitlist: ${p.session}, ${day(p.start)}`,
    body: out.join("\n"),
    buttons: p.status === "confirmed" && p.cantAttendLink ? [{ url: p.cantAttendLink, label: cancelLabel() }] : [],
  };
}
