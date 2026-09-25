/**
 * Put a roster into the database: parse, work out what changed, replace.
 *
 * Both importers run through here — the paste box on the admin page and
 * the nightly cron — so an automatic refresh and a hand-pasted sheet
 * leave the same audit trail and make the same promises: a list is
 * replaced wholesale, and anyone added by hand survives it.
 *
 * Reads and writes; the parsing next door in ./import.ts stays pure.
 */
import { prisma } from "@/lib/prisma";
import { looksLikeSignInPage, parseRoster } from "./import";

/** A pasted sheet, not a database. Past this it is a file upload. */
export const MAX_IMPORT_ROWS = 20_000;

/**
 * The one list the nightly refresh can read on its own.
 *
 * The EQUIP workbooks are on SharePoint, which needs Microsoft
 * credentials somebody at U of T has to issue; until then those two stay
 * a paste. Server-side only — the link is an env var, not a secret worth
 * shipping to a browser.
 */
export const AUTO_SOURCE_ID = "engage-experience";
export const autoRefreshes = (sourceId: string) =>
  sourceId === AUTO_SOURCE_ID && Boolean(process.env.ELIGIBILITY_SHEET_CSV);

export type AppliedRoster =
  | { ok: false; skipped: number }
  | { ok: true; importId: string; rows: number; skipped: number; added: string[]; removed: string[] };

export async function applyRoster(opts: {
  sourceId: string;
  text: string;
  /** How it arrived: "upload" | "cron". Shown to admins. */
  method: string;
  filename?: string | null;
  byId?: string | null;
}): Promise<AppliedRoster> {
  const { sourceId, text, method } = opts;
  const { rows, skipped } = parseRoster(text, MAX_IMPORT_ROWS);
  // Nothing parsed is never "the programme lost everybody" — it is a bad
  // paste or a broken link, so the list is left exactly as it was.
  if (rows.length === 0) return { ok: false, skipped };

  /*
   * What this import changes, worked out BEFORE the rows are replaced.
   *
   * Compared against the whole source, hand-added rows included: an
   * admin who added somebody by hand last week does not want them
   * reported as "new" every time the sheet is re-imported. Removals are
   * only the rows an import owns — somebody added by hand survives the
   * replace below, so calling them removed would be a lie.
   */
  const before = await prisma.eligibilityEntry.findMany({
    where: { sourceId },
    select: { emailKey: true, email: true, addedById: true },
  });
  const beforeKeys = new Set(before.map((r) => r.emailKey));
  const incomingKeys = new Set(rows.map((r) => r.emailKey));
  const added = rows.filter((r) => !beforeKeys.has(r.emailKey)).map((r) => r.email);
  const removed = before
    .filter((r) => r.addedById === null && !incomingKeys.has(r.emailKey))
    .map((r) => r.email);

  const record = await prisma.eligibilityImport.create({
    data: {
      sourceId,
      method,
      filename: opts.filename?.slice(0, 200) || null,
      rowsRead: text.split(/\r?\n/).slice(0, MAX_IMPORT_ROWS).filter((l) => l.trim()).length,
      rowsAccepted: rows.length,
      rowsSkipped: skipped,
      addedEmails: added,
      removedEmails: removed,
      byId: opts.byId ?? null,
    },
    select: { id: true },
  });

  /*
   * Replace this list's rows, leave the other lists alone. An import is
   * the list as it stands now — somebody removed from the programme
   * should stop being eligible, which a merge would never notice.
   * Anyone added by hand survives: they were added precisely because
   * the export was wrong.
   */
  await prisma.$transaction([
    prisma.eligibilityEntry.deleteMany({ where: { sourceId, addedById: null } }),
    prisma.eligibilityEntry.createMany({
      data: rows.map((r) => ({ ...r, sourceId, importId: record.id })),
      skipDuplicates: true,
    }),
  ]);

  return { ok: true, importId: record.id, rows: rows.length, skipped, added, removed };
}

/** Record a run that read nothing, so a cron nobody is watching leaves a trace. */
export async function recordFailedImport(sourceId: string, method: string, error: string) {
  await prisma.eligibilityImport.create({
    data: {
      sourceId, method, filename: null,
      rowsRead: 0, rowsAccepted: 0, rowsSkipped: 0,
      addedEmails: [], removedEmails: [], error: error.slice(0, 400), byId: null,
    },
  });
}

/* ── reading the sheet itself ─────────────────────────────────────── */

/**
 * However many people are refused in a minute, the sheet is read at
 * most this often. A miss is a good reason to look again; two hundred
 * misses is not two hundred reasons.
 */
export const REFRESH_COOLDOWN_MS = 10 * 60_000;

/** A form is waiting on this one, so it gives up sooner than the cron does. */
const ON_MISS_TIMEOUT_MS = 8_000;
const CRON_TIMEOUT_MS = 20_000;

export interface SheetImport {
  ok: boolean;
  error?: string;
  rows: number;
  added: number;
  removed: number;
}

/**
 * Fetch the published sheet and make it the list.
 *
 * One path for both callers — the nightly job and the on-miss refresh —
 * so an automatic import is the same operation however it was set off,
 * and the history reads the same.
 */
export async function importFromSheet(opts: { method: string; timeoutMs?: number }): Promise<SheetImport> {
  const url = process.env.ELIGIBILITY_SHEET_CSV;
  if (!url) return { ok: false, error: "ELIGIBILITY_SHEET_CSV is not set.", rows: 0, added: 0, removed: 0 };

  let text = "";
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(opts.timeoutMs ?? CRON_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`the sheet answered ${res.status}`);
    text = await res.text();
    if (looksLikeSignInPage(text)) {
      throw new Error("that link wants a sign-in — share the sheet, or publish it to the web as CSV");
    }
  } catch (err) {
    const error = (err as Error).message || "the sheet could not be read";
    await recordFailedImport(AUTO_SOURCE_ID, opts.method, error);
    return { ok: false, error, rows: 0, added: 0, removed: 0 };
  }

  const done = await applyRoster({ sourceId: AUTO_SOURCE_ID, text, method: opts.method });
  if (!done.ok) {
    const error = "no addresses in what came back — the list was left alone";
    await recordFailedImport(AUTO_SOURCE_ID, opts.method, error);
    return { ok: false, error, rows: 0, added: 0, removed: 0 };
  }
  return { ok: true, rows: done.rows, added: done.added.length, removed: done.removed.length };
}

/**
 * Somebody was not on the list — so look again before believing it.
 *
 * The lists go stale the moment a programme accepts somebody, and the
 * only way anybody found out used to be a person being told they are
 * not on it. That miss is the best possible signal that the list is
 * behind, and it costs nothing when nobody registers: no polling, no
 * schedule, one read of the sheet at the moment it might matter.
 *
 * Returns true only when the list actually changed, which is the
 * caller's cue to ask again about this address.
 */
export async function refreshOnMiss(now: Date = new Date()): Promise<boolean> {
  if (!autoRefreshes(AUTO_SOURCE_ID)) return false;

  /*
   * The cooldown is read from the import history rather than kept in
   * memory: every serverless instance sees the same rows, and a FAILED
   * attempt counts too — a link that has stopped working must not be
   * retried by every registrant who misses.
   */
  const last = await prisma.eligibilityImport.findFirst({
    // A hand-pasted list counts too: an admin who imported it five
    // minutes ago has already made it as current as the sheet is.
    where: { sourceId: AUTO_SOURCE_ID, method: { in: ["cron", "miss", "upload"] } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (last && now.getTime() - last.createdAt.getTime() < REFRESH_COOLDOWN_MS) return false;

  const done = await importFromSheet({ method: "miss", timeoutMs: ON_MISS_TIMEOUT_MS });
  return done.ok && done.added > 0;
}
