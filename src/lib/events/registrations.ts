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
  source: string;
  href: string;
}

const LUMA_EVENTS = [
  { key: "insights", title: "Industry Insights", when: "Thu 24 Sep", apiId: "evt-mkgN5TBGw4fnk7l", href: "https://luma.com/413vhu2v" },
  { key: "symposium", title: "Annual Symposium", when: "Thu 29 Oct", apiId: "evt-az4yQOZR33DBiid", href: "https://luma.com/wh30nh1n" },
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
  const [insights, symposium, training] = await Promise.all([
    lumaCount(LUMA_EVENTS[0].apiId),
    lumaCount(LUMA_EVENTS[1].apiId),
    trainingWeekCount().catch(() => null),
  ]);
  const luma = (e: (typeof LUMA_EVENTS)[number], count: number | null): RegistrationCount => ({
    key: e.key, title: e.title, when: e.when, count, source: "on Luma", href: e.href,
  });
  return {
    at: new Date().toISOString(),
    events: [
      luma(LUMA_EVENTS[0], insights),
      luma(LUMA_EVENTS[1], symposium),
      {
        key: "training",
        title: "Training Week",
        when: "26–28 Oct",
        count: training,
        source: "on the registration form",
        href: "/admin/workspace/training-admin?tab=registrants",
      },
    ],
  };
}
