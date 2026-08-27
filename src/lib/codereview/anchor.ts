/**
 * Keeping a note pointed at the right line after the code is pasted again.
 *
 * The workflow this exists for: paste v1, leave five notes, send them to
 * whoever can fix them, paste v2, and the notes must still mean
 * something. Line numbers move. A note that silently follows its old
 * number lands on somebody else's markup and is worse than no note.
 *
 * The approach is the one NewsletterComment already uses for the
 * rendered issue, where anchorQuote is documented as "the primary way a
 * comment finds its home again after a regenerate": match on the TEXT
 * first and the position second. Here the text is the line itself, and
 * the position is only a tie-breaker — which matters more in HTML than
 * anywhere else, because `</td>` appears three hundred times in a
 * Mailchimp export and every one of them is an exact match.
 *
 * Pure: no React, no Prisma. The whole value is that the awkward cases
 * can be written down as tests.
 */

/** What is stored with a note so it can be found again. */
export interface Anchor {
  /** Where it was when the note was written. A hint, not the answer. */
  line: number;
  /** That line's own text. The primary key to finding it again. */
  lineText: string;
  /** Nearest non-blank line above, for telling identical lines apart. */
  before?: string;
  /** Nearest non-blank line below, same reason. */
  after?: string;
}

export type MatchKind =
  /** Same text at the same number — nothing moved. */
  | "exact"
  /** The text occurs once elsewhere. */
  | "moved"
  /** Several identical lines; neighbours or distance chose one. */
  | "ambiguous"
  /** Only found after ignoring indentation and inner whitespace. */
  | "loose"
  /** Not found at all. The note is kept and shown apart. */
  | "orphaned";

export interface Located {
  /** 1-based. null when orphaned. */
  line: number | null;
  kind: MatchKind;
}

/** Whitespace-insensitive form, for the last resort before giving up. */
function loose(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Nearest non-blank neighbours, which is what makes `</td>` findable. */
export function neighbours(lines: string[], index: number): { before?: string; after?: string } {
  let b: string | undefined;
  let a: string | undefined;
  for (let i = index - 1; i >= 0; i--) if (lines[i].trim()) { b = lines[i].trim(); break; }
  for (let i = index + 1; i < lines.length; i++) if (lines[i].trim()) { a = lines[i].trim(); break; }
  return { before: b, after: a };
}

/** Build the anchor for a note being written now. `line` is 1-based. */
export function makeAnchor(code: string, line: number): Anchor | null {
  const lines = splitLines(code);
  const i = line - 1;
  if (i < 0 || i >= lines.length) return null;
  return { line, lineText: lines[i].trim(), ...neighbours(lines, i) };
}

/** One place that decides what a "line" is, so every caller agrees. */
export function splitLines(code: string): string[] {
  return String(code ?? "").replace(/\r\n?/g, "\n").split("\n");
}

/**
 * Find where a note belongs in a new paste.
 *
 * Deliberately ordered cheapest-and-most-certain first. The last step
 * is giving up, which is a real answer: an orphaned note keeps its text
 * and is shown on its own, because deleting somebody's note is not this
 * function's decision and pinning it to a wrong line is worse than
 * admitting it is lost.
 */
export function locate(anchor: Anchor, code: string): Located {
  const lines = splitLines(code);
  const want = anchor.lineText.trim();
  if (!want) {
    // A note pinned to a blank line can only be found by position.
    const i = anchor.line - 1;
    return i >= 0 && i < lines.length && !lines[i].trim()
      ? { line: anchor.line, kind: "exact" }
      : { line: null, kind: "orphaned" };
  }

  const trimmed = lines.map((l) => l.trim());

  // 1. Same text, same place. The overwhelmingly common case.
  if (trimmed[anchor.line - 1] === want) return { line: anchor.line, kind: "exact" };

  // 2. The text occurs exactly once somewhere else.
  const hits: number[] = [];
  for (let i = 0; i < trimmed.length; i++) if (trimmed[i] === want) hits.push(i + 1);
  if (hits.length === 1) return { line: hits[0], kind: "moved" };

  // 3. Several identical lines — which is normal in HTML. Prefer one
  //    whose neighbours match, then the one nearest where it used to be.
  if (hits.length > 1) {
    /*
     * Both neighbours must agree, and an ABSENT neighbour counts.
     *
     * undefined here means "there was nothing above/below it" — the
     * line was at the edge of the document — which is a fact about the
     * anchor, not a missing value. Treating it as "no constraint"
     * matched a line in the middle of a run against a note that was
     * pinned to the end of one.
     */
    const byNeighbour = hits.filter((n) => {
      const { before, after } = neighbours(lines, n - 1);
      return before === anchor.before && after === anchor.after;
    });
    const pool = byNeighbour.length > 0 ? byNeighbour : hits;
    const nearest = pool.reduce((best, n) =>
      Math.abs(n - anchor.line) < Math.abs(best - anchor.line) ? n : best,
    );
    return { line: nearest, kind: byNeighbour.length === 1 ? "moved" : "ambiguous" };
  }

  // 4. The line was edited. Try again ignoring indentation and inner
  //    whitespace, which is most of what an editor changes by accident.
  const wantLoose = loose(want);
  const looseHits: number[] = [];
  for (let i = 0; i < lines.length; i++) if (loose(lines[i]) === wantLoose) looseHits.push(i + 1);
  if (looseHits.length > 0) {
    const nearest = looseHits.reduce((best, n) =>
      Math.abs(n - anchor.line) < Math.abs(best - anchor.line) ? n : best,
    );
    return { line: nearest, kind: "loose" };
  }

  // 5. Gone. Say so.
  return { line: null, kind: "orphaned" };
}

/** Re-anchor a whole set at once, keeping each note's identity. */
export function relocateAll<T extends { anchor: Anchor }>(
  notes: T[],
  code: string,
): (T & { located: Located })[] {
  return notes.map((n) => ({ ...n, located: locate(n.anchor, code) }));
}
