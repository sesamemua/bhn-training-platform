/**
 * Is this person on one of the programme lists?
 *
 * The one place the roster is read. Everything that needs the answer —
 * the form while somebody is filling it in, the submit path that must
 * not trust the browser, the admin screen — comes through here, so
 * there is one definition of "eligible" rather than three that drift.
 */
import { prisma } from "@/lib/prisma";
import { emailKey } from "./email-key";
import { eligibilityGate, type Gate } from "./gate";
import { eligibilitySource } from "./sources";
export { BLOCKED_MESSAGE } from "./messages";

export interface EligibilityVerdict {
  /** Whether the roster is allowed to turn anybody away at all. */
  gate: Gate;
  /** null when the address could not be read as an address. */
  key: string | null;
  /** True when this person is on at least one list. */
  matched: boolean;
  /** Which lists, for the admin view. Never shown to a registrant. */
  sourceIds: string[];
  /** Programmes the match grants, for the admin view. */
  programmes: string[];
  /**
   * True when the registration should be stopped. Only ever true when
   * the roster is enforcing AND there is no match — a roster nobody has
   * loaded refuses nobody.
   */
  blocked: boolean;
}

/** The roster's state, for the interlock. One query, two numbers. */
export async function rosterState() {
  const [total, latest] = await Promise.all([
    prisma.eligibilityEntry.count(),
    prisma.eligibilityImport.findFirst({
      where: { error: null },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);
  return { total, lastImportAt: latest?.createdAt ?? null };
}

/**
 * Look one address up.
 *
 * Matched on the normalised key with plain equality. Never a
 * case-insensitive filter: on Postgres those compile to ILIKE, and an
 * underscore in an address — which is ordinary — would act as a
 * wildcard and match somebody else.
 */
export async function checkEligibility(rawEmail: string): Promise<EligibilityVerdict> {
  const gate = eligibilityGate(await rosterState(), new Date());
  const key = emailKey(rawEmail);

  if (!key) {
    // Not an address at all. The form's own email validation catches
    // this first; treated as no match rather than as a match.
    return { gate, key: null, matched: false, sourceIds: [], programmes: [], blocked: gate.enforcing };
  }

  const rows = await prisma.eligibilityEntry.findMany({
    where: { emailKey: key },
    select: { sourceId: true },
  });

  const sourceIds = rows.map((r) => r.sourceId);
  const programmes = [
    ...new Set(sourceIds.flatMap((id) => eligibilitySource(id)?.programmes ?? [])),
  ];
  const matched = rows.length > 0;

  return { gate, key, matched, sourceIds, programmes, blocked: gate.enforcing && !matched };
}
