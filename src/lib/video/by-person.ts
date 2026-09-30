/**
 * One person's view of a video project, pulled together from every tab:
 * their filming-day timeline, their line on the call sheet, what they
 * have to do before the shoot and on the prep day, what they bring, and
 * their scripts. Nothing is stored here — it is all read from the tabs.
 *
 * People are matched across tabs by name: the filming day and the task
 * lists hold ids, but the packing list and the call sheet hold names.
 * ponytail: first-name match, so two people sharing a first name would
 * merge — give them full names on the Filming day if that ever happens.
 *
 * Pure module: no React, no Prisma.
 */
import { ON_CAMERA, filmStart } from "@/lib/video/filming";
import type { KitItem } from "@/lib/video/kit";
import type { PrepTask } from "@/lib/video/prep";
import type { CallSheetData } from "@/lib/video/call-sheet";

export const personSlug = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const first = (s: string) => norm(s).split(" ")[0];
/** "Yeseul" and "Yeseul Lee" are the same person; "Yoo Jin" matches "Yoo Jin Kim". */
export const sameName = (a: string, b: string) => {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  return x === y || x.startsWith(`${y} `) || y.startsWith(`${x} `) || (first(x) === first(y) && (!x.includes(" ") || !y.includes(" ")));
};

export interface RosterPerson { id: string; name: string; group: string; role: string }
export interface DayBlock {
  id: string; kind: string; title: string; start: string; end: string; prepMinutes: number;
  flexible: boolean; done: boolean; people: string[]; facilitators: string[];
}
export interface ScriptPanel { key: string; label: string; text: string }

export interface DayItem {
  id: string; title: string; start: string; end: string;
  /** When the camera turns, for blocks that are filmed. */
  filming: string | null;
  how: "on camera" | "facilitating" | "on it";
  flexible: boolean; done: boolean;
}
export interface PersonView {
  slug: string; name: string; group: string; role: string;
  day: DayItem[];
  /** The earliest thing they are on, ISO. */
  arrive: string | null;
  callSheet: { role: string; call: string; notes: string } | null;
  before: PrepTask[];
  prep: PrepTask[];
  bring: KitItem[];
  scripts: { key: string; label: string }[];
}

/** Script tabs that belong to someone: the tab named after them, or one that says "@Name" or "Script 3, with Name" — not a tab that merely mentions them. */
export function scriptsFor(name: string, panels: ScriptPanel[]) {
  const f = name.trim().split(/\s+/)[0];
  if (!f) return [];
  const esc = f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tag = new RegExp(`(@|\\bScript \\d+, with )${esc}\\b`);
  return panels.filter((p) => sameName(p.label, name) || tag.test(p.text)).map(({ key, label }) => ({ key, label }));
}

/** Every name anywhere in the project: the filming day first, then anyone only on the packing list or the call sheet. */
export function roster(people: RosterPerson[], kitOwners: string[], sheet: CallSheetData | null): RosterPerson[] {
  const out = [...people];
  const extra = [...kitOwners.map((n) => ({ name: n, role: "" })), ...(sheet?.people ?? []).map((p) => ({ name: p.name, role: p.role }))];
  for (const x of extra) if (x.name.trim() && !out.some((p) => sameName(p.name, x.name))) out.push({ id: `name:${personSlug(x.name)}`, name: x.name.trim(), group: "other", role: x.role });
  return out;
}

export function personView(p: RosterPerson, src: {
  blocks: DayBlock[]; before: PrepTask[]; prep: PrepTask[]; kit: KitItem[]; sheet: CallSheetData | null; panels: ScriptPanel[];
}): PersonView {
  const day: DayItem[] = src.blocks
    .filter((b) => b.people.includes(p.id) || b.facilitators.includes(p.id))
    .map((b) => {
      const onCam = ON_CAMERA.has(b.kind);
      return {
        id: b.id, title: b.title, start: b.start, end: b.end, flexible: b.flexible, done: b.done,
        filming: onCam ? new Date(filmStart(b)).toISOString() : null,
        how: b.facilitators.includes(p.id) ? "facilitating" as const : onCam && b.kind === "interview" ? "on camera" as const : "on it" as const,
      };
    })
    .sort((a, b) => a.start.localeCompare(b.start));
  const line = src.sheet?.people.find((x) => sameName(x.name, p.name));
  const mine = (t: PrepTask) => !t.removed && t.people.includes(p.id);
  return {
    slug: personSlug(p.name), name: p.name, group: p.group, role: p.role || line?.role || "",
    day,
    arrive: day[0]?.start ?? null,
    callSheet: line ? { role: line.role, call: line.call, notes: line.notes } : null,
    before: src.before.filter(mine),
    prep: src.prep.filter(mine),
    bring: src.kit.filter((i) => !i.removed && i.owner && sameName(i.owner, p.name)),
    scripts: scriptsFor(p.name, src.panels),
  };
}

/** The script's tabs, from its HTML: `.doc-panel[data-tab][data-label]`, with each tab's own text (up to the next tab). */
export function scriptPanels(html: string): ScriptPanel[] {
  const re = /<div class="doc-panel[^"]*"[^>]*?data-tab="([^"]+)"[^>]*?data-label="([^"]+)"/g;
  const hits = [...html.matchAll(re)];
  return hits.map((m, i) => ({
    key: m[1], label: m[2],
    text: html.slice(m.index!, hits[i + 1]?.index ?? html.length).replace(/<[^>]+>/g, " "),
  }));
}
