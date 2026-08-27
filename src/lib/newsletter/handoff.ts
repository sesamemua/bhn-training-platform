/**
 * Taking the issue out to somebody else's AI, and bringing it back.
 *
 * The platform can lay a piece out itself (normalisePiece), but an
 * editor who wants to do that pass in their own tool needs two things
 * the app did not give them: the raw submissions in a form they can
 * paste somewhere, and a way to put the result back that does not
 * involve retyping thirty fields.
 *
 * So: one brief out, one paste in. Both ends pure — no Prisma, no
 * React — because the whole value here is that the parse can be tested
 * against the malformed things a chat model actually returns.
 */
import { SECTIONS, type Section, type PieceLayout } from "./types";

export interface HandoffPiece {
  id: string;
  section: Section;
  rawBody: string;
  sourceUrl?: string | null;
  authorName?: string | null;
}

/* ── Out ─────────────────────────────────────────────────────────── */

/**
 * The whole prompt, ready to paste into a chat window.
 *
 * It carries the schema rather than describing it, and it tags every
 * piece with its id, because the id is how the answer gets matched
 * back to the submission. A model that returns beautiful layouts in a
 * different order, with the ids dropped, has produced something nobody
 * can apply.
 */
export function buildAiBrief(pieces: HandoffPiece[], dateline: string): string {
  const bySection = SECTIONS.map((s) => ({
    section: s,
    items: pieces.filter((p) => p.section === s),
  })).filter((g) => g.items.length > 0);

  const submissions = bySection
    .map((g) =>
      [
        `### SECTION: ${g.section}`,
        ...g.items.map((p) =>
          [
            `--- PIECE id: ${p.id}`,
            p.authorName ? `submitted by: ${p.authorName}` : null,
            p.sourceUrl ? `link the contributor gave: ${p.sourceUrl}` : null,
            "",
            p.rawBody.trim() || "(empty)",
          ]
            .filter((l) => l !== null)
            .join("\n"),
        ),
      ].join("\n\n"),
    )
    .join("\n\n");

  return `You are laying out the BioHubNet monthly newsletter for ${dateline}.

Below are colleagues' raw submissions, grouped by section. Turn each one
into a layout object. Return ONE JSON object and nothing else:

{ "pieces": [ { "id": "<the id from the piece>", "layout": { ... } }, ... ] }

The layout object:

{
  "headline": "string, required",
  "subhead":  "string or omit",
  "body":     ["paragraph", "..."],        // required, 1-3 tight paragraphs
  "glance":   [{"label":"DATES","value":"...","accent":false}] or omit,
  "peopleLabel": "string or omit",
  "people":   [{"name":"...","detail":"...","org":"..."}] or omit,
  "links":    [{"label":"...","url":"..."}] or omit,
  "note":     "string or omit",
  "noteBadge":"1-2 words or omit",
  "ctaLabel": "string or omit",
  "ctaUrl":   "https://... or omit"
}

Choosing the shape:
- "glance" ONLY when the submission states concrete logistics. Labels short
  and uppercase: DATES, LOCATION, FORMAT, COMMITMENT, APPLY BY. Set
  accent:true on a deadline row so it renders in alert red.
- "people" when individuals are named. "detail" is their programme or
  institution, "org" is the employer or host lab. "peopleLabel" groups them.
- "links" when SEVERAL named destinations of equal weight are listed, each
  with its own URL. Labels are the thing's own name, 2-5 words.
- "note" for a short forward-looking aside; "noteBadge" is a chip like
  "Coming Soon".
- "body" for everything else.
Most pieces need only headline + body.

Rules:
- Return one entry for EVERY piece below, with its id copied exactly.
- Keep the contributor's facts and tone. Tighten wording; invent nothing.
- No dates, names, numbers or URLs that are not in the submission.
- Do not repeat a headline across pieces.
- Plain text in every string. No markdown, no HTML.

SUBMISSIONS

${submissions}`;
}

/* ── Back ────────────────────────────────────────────────────────── */

export interface ParsedPiece {
  id: string;
  layout: PieceLayout;
}

export interface ParseReport {
  ok: boolean;
  /** Layouts that validated and belong to a piece in this issue. */
  applied: ParsedPiece[];
  /** Pieces in the issue that the paste said nothing about. */
  missing: { id: string; section: Section }[];
  /** Ids in the paste that are not in this issue. */
  unknown: string[];
  /** Per-piece complaints, in words an editor can act on. */
  problems: string[];
}

/**
 * Find the JSON in whatever came back.
 *
 * Chat models wrap answers in prose, in ```json fences, or both, and an
 * editor pasting from a chat window will bring all of it. Refusing that
 * paste would be technically correct and useless.
 */
export function extractJson(text: string): string | null {
  const t = String(text ?? "").trim();
  if (!t) return null;

  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : t;

  /*
   * The outermost object OR array, so leading "Here you go:" and
   * trailing commentary both fall away.
   *
   * Both, because a model asked for { "pieces": [...] } will sometimes
   * return the bare array instead — and looking only for braces sliced
   * that down to its first element, quietly applying one layout out of
   * ten. Whichever bracket opens first wins.
   */
  const open = [
    { o: candidate.indexOf("{"), c: candidate.lastIndexOf("}") },
    { o: candidate.indexOf("["), c: candidate.lastIndexOf("]") },
  ]
    .filter((b) => b.o !== -1 && b.c > b.o)
    .sort((a, b) => a.o - b.o)[0];
  if (!open) return null;
  return candidate.slice(open.o, open.c + 1);
}

const str = (v: unknown): string | undefined => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : undefined;
};

/** One layout, validated. Returns the reasons it is unusable, if any. */
function readLayout(raw: unknown, where: string): { layout?: PieceLayout; problems: string[] } {
  const problems: string[] = [];
  if (!raw || typeof raw !== "object") {
    return { problems: [`${where}: no layout object.`] };
  }
  const o = raw as Record<string, unknown>;

  const headline = str(o.headline);
  if (!headline) problems.push(`${where}: no headline.`);

  const bodyRaw = Array.isArray(o.body) ? o.body : typeof o.body === "string" ? [o.body] : [];
  const body = bodyRaw.map((b) => str(b)).filter((b): b is string => !!b);
  if (body.length === 0) problems.push(`${where}: no body text.`);

  if (problems.length > 0) return { problems };

  const rows = <T,>(v: unknown, f: (x: Record<string, unknown>) => T | null): T[] | undefined => {
    if (!Array.isArray(v)) return undefined;
    const out = v
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .map(f)
      .filter((x): x is T => x !== null);
    return out.length > 0 ? out : undefined;
  };

  const layout: PieceLayout = {
    headline: headline!,
    body,
    ...(str(o.subhead) ? { subhead: str(o.subhead)! } : {}),
    ...(str(o.peopleLabel) ? { peopleLabel: str(o.peopleLabel)! } : {}),
    ...(str(o.note) ? { note: str(o.note)! } : {}),
    ...(str(o.noteBadge) ? { noteBadge: str(o.noteBadge)! } : {}),
    ...(str(o.ctaLabel) ? { ctaLabel: str(o.ctaLabel)! } : {}),
    ...(str(o.ctaUrl) ? { ctaUrl: str(o.ctaUrl)! } : {}),
  };

  const glance = rows(o.glance, (g) => {
    const label = str(g.label);
    const value = str(g.value);
    return label && value ? { label, value, accent: g.accent === true } : null;
  });
  if (glance) layout.glance = glance;

  const people = rows(o.people, (p) => {
    const name = str(p.name);
    return name ? { name, detail: str(p.detail) ?? "", org: str(p.org) ?? "" } : null;
  });
  if (people) layout.people = people;

  const links = rows(o.links, (l) => {
    const label = str(l.label);
    const url = str(l.url);
    return label && url ? { label, url } : null;
  });
  if (links) layout.links = links;

  return { layout, problems };
}

/**
 * Read a paste against the issue it claims to describe.
 *
 * Deliberately partial: a paste covering nine of ten pieces applies the
 * nine and names the tenth. Refusing the lot because one entry was
 * malformed would send the editor back to a chat window to redo work
 * that was already right.
 */
export function parseAiReturn(text: string, pieces: HandoffPiece[]): ParseReport {
  const empty: ParseReport = { ok: false, applied: [], missing: [], unknown: [], problems: [] };

  const json = extractJson(text);
  if (!json) {
    return { ...empty, problems: ["No JSON found in that. Paste the whole reply, including the braces."] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return { ...empty, problems: [`That is not valid JSON — ${(e as Error).message}`] };
  }

  const container = parsed as Record<string, unknown>;
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray(container?.pieces)
      ? container.pieces
      : null;
  if (!list) {
    return { ...empty, problems: ['Expected { "pieces": [ ... ] } at the top level.'] };
  }

  const byId = new Map(pieces.map((p) => [p.id, p]));
  const applied: ParsedPiece[] = [];
  const unknown: string[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const [i, entryRaw] of list.entries()) {
    const entry = (entryRaw ?? {}) as Record<string, unknown>;
    const id = str(entry.id);
    if (!id) {
      problems.push(`Entry ${i + 1} has no id, so there is no way to tell which submission it is for.`);
      continue;
    }
    const piece = byId.get(id);
    if (!piece) {
      unknown.push(id);
      continue;
    }
    if (seen.has(id)) {
      problems.push(`Two layouts came back for the same piece (${id}); the first was used.`);
      continue;
    }
    seen.add(id);

    const where = `“${piece.rawBody.trim().slice(0, 40) || piece.section}…”`;
    const { layout, problems: pp } = readLayout(entry.layout ?? entry, where);
    problems.push(...pp);
    if (layout) applied.push({ id, layout });
  }

  const missing = pieces
    .filter((p) => !seen.has(p.id))
    .map((p) => ({ id: p.id, section: p.section }));

  return { ok: applied.length > 0, applied, missing, unknown, problems };
}
