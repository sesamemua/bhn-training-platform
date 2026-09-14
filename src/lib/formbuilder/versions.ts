/**
 * Naming the next version of a form.
 *
 * A form people have already registered on cannot change under them —
 * the answers they gave were to the questions they were shown. A new
 * version is a new EventForm row at a new slug, so the old link, the
 * old wording and the old registrations all stay exactly where they
 * were.
 *
 * Pure. The action reads which slugs are taken and asks here, so the
 * naming can be tested without a database.
 */
import { BuiltFormSchema, parseForm, type BuiltForm } from "./types";

/**
 * `-v2` … `-v999`. No leading zero and no four-digit numbers, so
 * "-v01" and "report-v2026" are part of a name rather than a version.
 */
const SLUG_VERSION = /-v([1-9]\d{0,2})$/;
/** ` (v2)` — the only marker versionedTitle writes, so the only one it strips. */
const TITLE_VERSION = /\s*\(v[1-9]\d{0,2}\)$/i;
/** renameForm's cap. A copy should not be a title the rename box would cut. */
const TITLE_MAX = 120;

/** The slug every version of a form shares: `training-week-registration-2026`. */
export function versionRoot(slug: string): string {
  return slug.replace(SLUG_VERSION, "");
}

/** 1 for the original, N for `-vN`. */
export function versionNumber(slug: string): number {
  const m = slug.match(SLUG_VERSION);
  return m ? Number(m[1]) : 1;
}

/** "v1" for the original, "vN" after that. */
export function versionLabel(slug: string): string {
  return `v${versionNumber(slug)}`;
}

/**
 * The slug for a new version: one past the highest version of this form
 * that exists.
 *
 * Past the highest rather than into a gap. A v2 copied from v3 would
 * read as older than the form it came from, and the number is the only
 * thing on the page that says which is newer.
 *
 * A `-vN` on the form being copied only counts as a version when the
 * form it would be a version of exists. createForm slugs "Survey v2" as
 * `survey-v2`; with no `survey` beside it that is a name, and reading it
 * as version 2 of nothing would skip to `survey-v3`. Its first version
 * is `survey-v2-v2`.
 */
export function nextVersionSlug(slug: string, taken: Iterable<string>): string {
  const all = new Set(taken);
  const isVersion = versionRoot(slug) !== slug && all.has(versionRoot(slug));
  const root = isVersion ? versionRoot(slug) : slug;
  let highest = isVersion ? versionNumber(slug) : 1;
  for (const s of all) {
    if (versionRoot(s) === root) highest = Math.max(highest, versionNumber(s));
  }
  let n = highest + 1;
  // Belt and braces: the number above is derived from the same set, but
  // a slug nobody expected must still never be handed out twice.
  while (all.has(`${root}-v${n}`)) n++;
  return `${root}-v${n}`;
}

/**
 * "Training Week Registration 2026 (v2)". Replaces a marker rather than
 * adding one, so a copy of a copy is "(v3)", not "(v2) (v3)".
 */
export function versionedTitle(title: string, n: number): string {
  const base = title.replace(TITLE_VERSION, "").trim() || "Untitled form";
  if (n <= 1) return base.slice(0, TITLE_MAX);
  const suffix = ` (v${n})`;
  return `${base.slice(0, TITLE_MAX - suffix.length).trimEnd()}${suffix}`;
}

/**
 * The document a new version starts from.
 *
 * Through parseForm and then the save schema — the same two gates a form
 * passes on its way out of and back into the builder — so the copy is
 * exactly what the builder shows for the original: presentation and slot
 * capacity included, anything the builder could not read either.
 */
export function copyForVersion(raw: unknown): BuiltForm | null {
  const r = BuiltFormSchema.safeParse(parseForm(raw));
  return r.success ? r.data : null;
}

/**
 * Why a stored form must not become a version, or null when it can.
 *
 * copyForVersion keeps what it can read and drops the rest without a
 * word. Right for the builder, wrong for a copy reported as made: a form
 * from the old editor (a bare array of questions) reads as empty, and a
 * malformed question would vanish from the copy with nothing said. The
 * same partial-read refusal the Training Week v2 build makes.
 */
export function copyProblem(raw: unknown, copy: BuiltForm): string | null {
  let stored = raw;
  if (typeof raw === "string") {
    try { stored = JSON.parse(raw); } catch { stored = null; }
  }
  if (Array.isArray(stored)) {
    return "This form was made with the old form editor, so it cannot be copied as a version.";
  }
  const count = (key: "fields" | "sources" | "steps") => {
    const list = stored && typeof stored === "object" ? (stored as Record<string, unknown>)[key] : undefined;
    return Array.isArray(list) ? list.length : 0;
  };
  const lost = [
    [count("fields") - copy.fields.length, "question"],
    [count("steps") - copy.steps.length, "workflow step"],
    [count("sources") - copy.sources.length, "data sheet"],
  ] as const;
  const said = lost.filter(([n]) => n !== 0).map(([n, what]) => `${n} ${what}${n === 1 ? "" : "s"}`);
  return said.length
    ? `This form was not copied: ${said.join(", ")} on it could not be read and would be missing from the copy.`
    : null;
}
