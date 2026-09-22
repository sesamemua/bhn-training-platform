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

/** The list whose members are read live from this database. */
export const PLATFORM_SOURCE_ID = "equip-application-form";

/** What an application row has to offer: the address it can be reached at. */
export interface ApplicationRow {
  applicantEmail: string | null;
  user: { email: string | null } | null;
}

/**
 * The mailboxes a set of EQUIP applications belongs to.
 *
 * Both addresses are read, not one: an application made from an
 * account carries no applicantEmail, and a public one has no account.
 * Normalised through the same emailKey the roster is keyed on, so the
 * two halves of "eligible" cannot disagree about what an address is.
 */
export function applicationKeys(rows: ApplicationRow[]): Set<string> {
  const keys = new Set<string>();
  for (const row of rows) {
    for (const raw of [row.applicantEmail, row.user?.email]) {
      const key = raw ? emailKey(raw) : null;
      if (key) keys.add(key);
    }
  }
  return keys;
}

/*
 * Read whole, then matched in memory.
 *
 * The key is a normalisation — dots, plus-tags, mail.utoronto.ca — so
 * there is no column to index and no query that can do this in SQL.
 * EQUIP applications are in the dozens and grow by a handful a month,
 * which makes reading two columns of them cheaper than the round trip
 * it would take to be clever. Worth revisiting past a few thousand
 * rows: store the key on the application and match on it.
 */
const applicationRows = () =>
  prisma.equipApplication.findMany({
    select: { applicantEmail: true, user: { select: { email: true } } },
  });

/** How many people have an application here, for the admin screen. */
export async function platformApplicantCount(): Promise<number> {
  return applicationKeys(await applicationRows()).size;
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

  const [rows, applied] = await Promise.all([
    prisma.eligibilityEntry.findMany({ where: { emailKey: key }, select: { sourceId: true } }),
    applicationRows().then((apps) => applicationKeys(apps).has(key)),
  ]);

  // An application made here counts like a row on an imported list —
  // it is the same fact, arriving without anybody exporting it.
  const sourceIds = [...rows.map((r) => r.sourceId), ...(applied ? [PLATFORM_SOURCE_ID] : [])];
  const programmes = [
    ...new Set(sourceIds.flatMap((id) => eligibilitySource(id)?.programmes ?? [])),
  ];
  const matched = sourceIds.length > 0;

  return { gate, key, matched, sourceIds, programmes, blocked: gate.enforcing && !matched };
}
