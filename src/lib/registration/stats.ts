import "server-only";

/**
 * What the switch is holding: the registrations already in.
 *
 * Beside a control that can shut the form, the number that matters is
 * how many people are on the other side of it — closing at 4 and
 * closing at 140 are different decisions, and a switch that does not
 * say which is a switch pressed on a guess.
 *
 * Read from the submissions rather than a counter, for the same reason
 * the dashboard tile is: a counter drifts and nobody notices.
 */
import { prisma } from "@/lib/prisma";
import { REGISTRATION_FORM_SLUG, REGISTRATION_FORM_WHERE } from "@/lib/allocation/symposium-2026";
import { versionRoot } from "@/lib/formbuilder/versions";

export interface RegistrationStats {
  /** People, not rows: one address registering twice is one person. */
  people: number;
  /** How many of them arrived in the last seven days. */
  lastWeek: number;
  /** Registrations whose address was on no programme list when they filed. */
  notOnList: number;
  /** When the most recent one came in, ISO. Null when there are none. */
  latest: string | null;
}

export async function registrationStats(): Promise<RegistrationStats> {
  const forms = (await prisma.eventForm.findMany({ where: REGISTRATION_FORM_WHERE, select: { id: true, slug: true } }))
    .filter((f) => versionRoot(f.slug) === REGISTRATION_FORM_SLUG);
  const rows = await prisma.eventFormSubmission.findMany({
    where: { formId: { in: forms.map((f) => f.id) } },
    select: { id: true, email: true, data: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const real = rows.filter((r) => (r.data as Record<string, unknown> | null)?.__test !== true);
  const who = (r: (typeof real)[number]) => r.email?.trim().toLowerCase() || r.id;
  const week = Date.now() - 7 * 86_400_000;

  return {
    people: new Set(real.map(who)).size,
    lastWeek: new Set(real.filter((r) => r.createdAt.getTime() >= week).map(who)).size,
    notOnList: real.filter((r) => (r.data as Record<string, unknown> | null)?.__eligibility === "not_matched").length,
    latest: real[0]?.createdAt.toISOString() ?? null,
  };
}
