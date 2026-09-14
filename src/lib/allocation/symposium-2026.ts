/**
 * What the 2026 Symposium group points at.
 *
 * One constant rather than the slug written into a page, a nav item and
 * a seed script separately — the whole reason the schedule needed
 * consolidating a commit ago was four copies of one fact drifting apart.
 */
export const REGISTRATION_FORM_SLUG = "training-week-registration-2026";

/**
 * The second version of the same registration, built from v1 plus the
 * team's feedback.
 *
 * A new row rather than an edit: v1 is live and people have registered
 * on it, so it stays exactly as they saw it. REGISTRATION_FORM_SLUG
 * above stays pinned to v1 on purpose — the maintenance scripts that
 * rewrite a form are keyed on it, and repointing it would have them
 * write v1-era wording into v2.
 */
export const REGISTRATION_FORM_SLUG_V2 = "training-week-registration-2026-v2";

/**
 * The two versions that exist today.
 *
 * Not what the registrant sheet reads any more — a later version made
 * with "Duplicate as new version" (-v3, …) has to pool too, so readers
 * select with REGISTRATION_FORM_WHERE below. Kept as the list of slugs
 * the code itself knows about.
 */
export const REGISTRATION_FORM_SLUGS = [REGISTRATION_FORM_SLUG, REGISTRATION_FORM_SLUG_V2] as const;

/**
 * Where to look for every version of the registration, as a Prisma
 * `where`. Deliberately wide (a prefix, so "-v2026" matches too); keep
 * only rows where `versionRoot(slug) === REGISTRATION_FORM_SLUG`, from
 * formbuilder/versions. That is not imported here: this file stays
 * dependency-free, and versions.ts importing it back would be a cycle.
 */
export const REGISTRATION_FORM_WHERE = {
  OR: [
    { slug: REGISTRATION_FORM_SLUG },
    { slug: { startsWith: `${REGISTRATION_FORM_SLUG}-v` } },
  ],
};

/**
 * Forms no script may write to, whatever it was asked.
 *
 * v1 is FROZEN: people registered on it, and the answers they gave were
 * to the questions they were shown. Every maintenance script that
 * rewrites a form checks this before it writes — they are keyed on
 * REGISTRATION_FORM_SLUG, so without it a stray --force lands on v1.
 */
export const FROZEN_FORM_SLUGS: ReadonlySet<string> = new Set([REGISTRATION_FORM_SLUG]);

/** Throws before a script writes a frozen form. Call it before any write, backups included. */
export function refuseFrozenForm(slug: string, script: string): void {
  if (FROZEN_FORM_SLUGS.has(slug)) {
    throw new Error(
      `Refusing: ${slug} is frozen — people have registered on it and it stays exactly as they saw it. ` +
      `${script} does not write it. A change to the registration belongs in a new version.`,
    );
  }
}

/**
 * The event this group is about.
 *
 * One constant rather than the slug typed into a nav item, a page and a
 * script separately — it has already been renamed once (it said 2025),
 * and a hard-coded copy in the sidebar would have been a dead link
 * nobody noticed until somebody clicked it.
 */
export const EVENT_SLUG = "2026-annual-symposium";
