/**
 * How many people have registered for the three upcoming events, for the
 * admin dashboard: Industry Insights and the Annual Symposium on Luma, and
 * Training Week on the platform's own registration form.
 *
 * Luma is read through the public endpoint its event pages load
 * (api2.luma.com/event/get) — no key, since the paid Luma API is not on
 * this calendar. The Symposium hides its guest list, which makes that
 * reply's guest_count 0; the per-ticket counts are still published, and
 * their sum is the total. Read live on every call: a count is only worth
 * showing if it is today's.
 *
 * The Symposium approves each registration, and the published counts are
 * approved guests only. Who is still awaiting approval, or on the
 * waitlist, Luma shows only to the event's hosts: the platform reads it
 * with a host's Luma sign-in (the luma.auth-session-key cookie, stored in
 * Vercel as LUMA_SESSION_KEY), and shows "—" without one.
 */
import { prisma } from "@/lib/prisma";
import { REGISTRATION_FORM_SLUG, REGISTRATION_FORM_WHERE } from "@/lib/allocation/symposium-2026";
import { versionRoot } from "@/lib/formbuilder/versions";

export interface RegistrationCount {
  key: "insights" | "symposium" | "training";
  title: string;
  when: string;
  /** null when the source could not be read this time. */
  count: number | null;
  /** What the count is: "registered on Luma", "approved on Luma"… */
  source: string;
  href: string;
  /** Symposium only: registrations not approved yet. null when the host view could not be read. */
  waiting?: LumaWaiting | null;
}

export interface LumaWaiting {
  approval: number;
  waitlist: number;
}

const LUMA_EVENTS = [
  { key: "insights", title: "Industry Insights", when: "Thu 24 Sep", apiId: "evt-mkgN5TBGw4fnk7l", href: "https://luma.com/413vhu2v", source: "registered on Luma" },
  { key: "symposium", title: "Annual Symposium", when: "Thu 29 Oct", apiId: "evt-az4yQOZR33DBiid", href: "https://luma.com/wh30nh1n", source: "approved on Luma" },
] as const;

/** Registered guests in a Luma event/get reply: the ticket counts, else guest_count. */
export function lumaTotal(reply: unknown): number | null {
  const r = (reply ?? {}) as { ticket_types?: { num_guests?: unknown }[]; guest_count?: unknown };
  const perTicket = (Array.isArray(r.ticket_types) ? r.ticket_types : [])
    .map((t) => t?.num_guests)
    .filter((n): n is number => typeof n === "number");
  if (perTicket.length > 0) return perTicket.reduce((a, b) => a + b, 0);
  return typeof r.guest_count === "number" ? r.guest_count : null;
}

async function lumaCount(apiId: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api2.luma.com/event/get?event_api_id=${apiId}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? lumaTotal(await res.json()) : null;
  } catch {
    return null;
  }
}

/** People the hosts haven't approved, in a Luma event/admin/get reply. */
export function lumaWaiting(reply: unknown): LumaWaiting | null {
  const counts = (reply as { guest_status_to_counts?: Record<string, { rsvps?: unknown } | undefined> } | null)
    ?.guest_status_to_counts;
  if (!counts) return null;
  const people = (status: string) => {
    const n = counts[status]?.rsvps;
    return typeof n === "number" ? n : 0;
  };
  return { approval: people("pending_approval"), waitlist: people("waitlist") };
}

async function lumaWaitingFor(apiId: string): Promise<LumaWaiting | null> {
  const session = process.env.LUMA_SESSION_KEY?.trim().replace(/^luma\.auth-session-key=/, "");
  if (!session) return null;
  try {
    const res = await fetch(`https://api.luma.com/event/admin/get?event_api_id=${apiId}`, {
      headers: { cookie: `luma.auth-session-key=${session}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    // 401: the sign-in has ended (signed out, or expired) — paste a fresh one.
    if (!res.ok) console.warn("[registrations] Luma host view", res.status);
    return res.ok ? lumaWaiting(await res.json()) : null;
  } catch {
    return null;
  }
}

/** People registered for Training Week on any version of the form: one per address, test rows left out. */
async function trainingWeekCount(): Promise<number> {
  const forms = (await prisma.eventForm.findMany({ where: REGISTRATION_FORM_WHERE, select: { id: true, slug: true } }))
    .filter((f) => versionRoot(f.slug) === REGISTRATION_FORM_SLUG);
  const rows = await prisma.eventFormSubmission.findMany({
    where: { formId: { in: forms.map((f) => f.id) } },
    select: { id: true, email: true, data: true },
  });
  const people = new Set(
    rows
      .filter((r) => (r.data as Record<string, unknown> | null)?.__test !== true)
      .map((r) => r.email?.trim().toLowerCase() || r.id),
  );
  return people.size;
}

export async function registrationCounts(): Promise<{ at: string; events: RegistrationCount[] }> {
  const [insights, symposium, waiting, training] = await Promise.all([
    lumaCount(LUMA_EVENTS[0].apiId),
    lumaCount(LUMA_EVENTS[1].apiId),
    lumaWaitingFor(LUMA_EVENTS[1].apiId),
    trainingWeekCount().catch(() => null),
  ]);
  const luma = (e: (typeof LUMA_EVENTS)[number], count: number | null): RegistrationCount => ({
    key: e.key, title: e.title, when: e.when, count, source: e.source, href: e.href,
  });
  return {
    at: new Date().toISOString(),
    events: [
      luma(LUMA_EVENTS[0], insights),
      { ...luma(LUMA_EVENTS[1], symposium), waiting },
      {
        key: "training",
        title: "Training Week",
        when: "26–28 Oct",
        count: training,
        source: "registered on the registration form",
        href: "/admin/workspace/training-admin?tab=registrants",
      },
    ],
  };
}
