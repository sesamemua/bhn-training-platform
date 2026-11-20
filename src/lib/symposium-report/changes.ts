/**
 * Track changes for the Event Report. Pure and client-safe: every save logs
 * which text fields changed (before → after); "Show changes" marks the
 * current text against the start of the round with the same word diff the
 * social post editor uses.
 */
import { diffWordsWithSpace } from "diff";
import type { Report } from "./document";

export const REPORT_EDIT_ACTION = "symposium.report.edit";

export type ReportField = { key: string; label: string; text: string };
export type FieldChange = { key: string; label: string; before: string; after: string };
export type Mark = { kind: "same" | "ins" | "del"; text: string };
export type ReportEdit = { id: string; at: string; author: string; fields: { key: string; label: string; marks: Mark[] }[] };
export type ReportChanges = { round: number; since: "round" | "tracking"; baseline: Record<string, string>; edits: ReportEdit[] };

/** Every editable text field, keyed so a page keeps its key when it moves. */
export function reportFields(report: Report): ReportField[] {
  return [
    { key: "cover.title", label: "Cover · title", text: report.cover.title },
    { key: "cover.theme", label: "Cover · theme", text: report.cover.theme },
    { key: "cover.date", label: "Cover · date", text: report.cover.date },
    ...report.pages.flatMap((page) => [
      { key: `page:${page.id}:label`, label: `${page.title} · label`, text: page.label },
      { key: `page:${page.id}:title`, label: `${page.title} · title`, text: page.title },
      { key: `page:${page.id}:text`, label: `${page.title} · text`, text: page.text },
    ]),
    { key: "back.title", label: "Back cover · title", text: report.back.title },
    { key: "back.text", label: "Back cover · text", text: report.back.text },
  ];
}

export function fieldChanges(before: Report, after: Report): FieldChange[] {
  const old = new Map(reportFields(before).map((field) => [field.key, field]));
  const next = reportFields(after);
  const keys = new Set(next.map((field) => field.key));
  return [
    ...next.filter((field) => (old.get(field.key)?.text ?? "") !== field.text)
      .map(({ key, label, text }) => ({ key, label, before: old.get(key)?.text ?? "", after: text })),
    ...[...old.values()].filter((field) => !keys.has(field.key) && field.text)
      .map(({ key, label, text }) => ({ key, label: `${label} (section removed)`, before: text, after: "" })),
  ];
}

export function marks(before: string, after: string): Mark[] {
  return diffWordsWithSpace(before, after).map((part) => ({ kind: part.added ? "ins" : part.removed ? "del" : "same", text: part.value }));
}

/**
 * Splits a page's marks across its laid-out blocks. Each block is the exact
 * slice [start, start + length) of the current text; a deletion goes to the
 * last block starting at or before it, so a removed paragraph shows where it was.
 */
export function marksByRange(all: Mark[], ranges: [number, number][]): Mark[][] {
  const out = ranges.map((): Mark[] => []);
  if (!ranges.length) return out;
  const owner = (at: number) => Math.max(0, ranges.findLastIndex(([start]) => start <= at));
  let at = 0;
  for (const mark of all) {
    if (mark.kind === "del") { out[owner(at)].push(mark); continue; }
    const end = at + mark.text.length;
    ranges.forEach(([start, stop], i) => {
      const from = Math.max(start, at), to = Math.min(stop, end);
      if (from < to) out[i].push({ kind: mark.kind, text: mark.text.slice(from - at, to - at) });
    });
    at = end;
  }
  return out;
}

/** Long unchanged runs shortened to a little context either side, for the change list. */
export function condense(all: Mark[], context = 60): Mark[] {
  return all.map((mark, i) => {
    if (mark.kind !== "same" || mark.text.length <= context * 2) return mark;
    const head = i === 0 ? "" : mark.text.slice(0, context);
    const tail = i === all.length - 1 ? "" : mark.text.slice(-context);
    return { kind: "same", text: `${head ? `${head} ` : ""}…${tail ? ` ${tail}` : ""}` };
  });
}

type LoggedEdit = { id: string; createdAt: Date; detail: string | null; actor: { name: string | null; email: string | null } };

/**
 * The comparison point for "Show changes": the previous round's snapshot when
 * there is one (the round started from it), otherwise each field's text before
 * its first logged edit this round. Edits arrive newest first.
 */
export function reportChanges(round: number, previous: Report | null, logged: LoggedEdit[]): ReportChanges {
  const parsed = logged.map((row) => {
    try {
      const detail = JSON.parse(row.detail ?? "{}") as { round?: number; changes?: FieldChange[] };
      return detail.round === round && Array.isArray(detail.changes) ? { row, changes: detail.changes } : null;
    } catch { return null; }
  }).filter((entry) => entry !== null);
  const baseline: Record<string, string> = {};
  if (previous) for (const field of reportFields(previous)) baseline[field.key] = field.text;
  else for (const { changes } of [...parsed].reverse()) for (const change of changes) baseline[change.key] ??= change.before;
  return {
    round, since: previous ? "round" : "tracking", baseline,
    edits: parsed.map(({ row, changes }) => ({
      id: row.id, at: row.createdAt.toISOString(), author: row.actor.name || row.actor.email || "Someone",
      fields: changes.map(({ key, label, before, after }) => ({ key, label, marks: condense(marks(before, after)) })),
    })),
  };
}

/** The text a field is compared against: its round baseline, "" if added this round, else the saved text. */
export function baselineOf(changes: ReportChanges, key: string, saved: string | undefined): string {
  if (key in changes.baseline) return changes.baseline[key];
  if (changes.since === "round") return ""; // added since the round started
  return saved ?? "";
}
