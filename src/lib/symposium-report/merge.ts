import { applyPatch, createPatch } from "diff";
import type { Report, ReportPage } from "./document";

/**
 * Three-way merge for autosave: `base` is the copy this tab last saved or loaded,
 * `mine` is this tab's current draft, `theirs` is what a colleague saved meanwhile.
 * Whatever only one side changed is kept; when both changed the same story text,
 * line edits are patched onto theirs, and if they overlap this tab's version wins
 * (the colleague's text is still in the Changes log).
 */
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

function value(base: unknown, mine: unknown, theirs: unknown, depth: number): unknown {
  if (same(mine, base)) return theirs;
  if (same(theirs, base) || same(mine, theirs)) return mine;
  if (typeof base === "string" && typeof mine === "string" && typeof theirs === "string") {
    const patched = applyPatch(theirs, createPatch("text", base, mine, "", "", { context: 1 }));
    return patched === false ? mine : patched;
  }
  if (depth > 0 && isObject(mine) && isObject(theirs)) {
    const before = isObject(base) ? base : {};
    const out: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(before), ...Object.keys(mine), ...Object.keys(theirs)])) {
      const merged = value(before[key], mine[key], theirs[key], depth - 1);
      if (merged !== undefined) out[key] = merged;
    }
    return out;
  }
  return mine;
}

function pages(base: ReportPage[], mine: ReportPage[], theirs: ReportPage[]) {
  const before = new Map(base.map((page) => [page.id, page]));
  const ours = new Map(mine.map((page) => [page.id, page]));
  const result: ReportPage[] = [];
  for (const page of theirs) {
    const old = before.get(page.id), edited = ours.get(page.id);
    if (!edited) { if (!old || !same(old, page)) result.push(page); continue; } // I removed it: drop unless they changed it
    result.push(old ? value(old, edited, page, 2) as ReportPage : edited);
  }
  // Sections I added, or that they removed while I was editing them, go back after their neighbour in my draft.
  mine.forEach((page, index) => {
    if (result.some((item) => item.id === page.id)) return;
    const old = before.get(page.id);
    if (old && same(old, page)) return; // they removed a section I never touched
    const previous = mine[index - 1]?.id;
    result.splice(previous ? result.findIndex((item) => item.id === previous) + 1 : 0, 0, page);
  });
  return result;
}

export function mergeReports(base: Report, mine: Report, theirs: Report): Report {
  return {
    cover: value(base.cover, mine.cover, theirs.cover, 1) as Report["cover"],
    pages: pages(base.pages, mine.pages, theirs.pages),
    back: value(base.back, mine.back, theirs.back, 1) as Report["back"],
  };
}
