/**
 * What to bring on a filming day: a checklist, grouped, ticked off as it
 * is packed. The starting list is the team's own plus a few suggestions
 * (marked); items can be added, removed and ticked, and the state is kept
 * per project.
 *
 * Pure module: no React, no Prisma.
 */
import { z } from "zod";

export const kitKey = (projectId: string) => `video.kit.${projectId}`;

export const KitItemSchema = z.object({
  id: z.string().min(1).max(40),
  group: z.string().min(1).max(40),
  label: z.string().trim().min(1).max(240),
  checked: z.boolean(),
  /** Added here rather than on the starting list. */
  custom: z.boolean(),
  /** A starting item somebody took off the list. */
  removed: z.boolean().default(false),
  /** Put on the starting list as a suggestion rather than asked for. */
  suggested: z.boolean().default(false),
  /** Who is bringing it — one of the list's people, or "" for nobody yet. */
  owner: z.string().max(60).default(""),
});
export type KitItem = z.infer<typeof KitItemSchema>;
export const KitSchema = z.array(KitItemSchema).max(300);

/** The list, and the people things are handed to. */
export const KitStateSchema = z.object({
  items: KitSchema,
  owners: z.array(z.string().trim().min(1).max(60)).max(20),
  /** Which version of the starting people this list has seen — so people added later join once, and stay gone if removed. */
  v: z.number().int().optional(),
});
export type KitState = z.infer<typeof KitStateSchema>;
/** Who brings things, to start with. */
export const DEFAULT_OWNERS = ["Alison", "Ruilin", "Roshni", "Yoo Jin", "Epshita", "Yeseul"];
/** People added to the starting list after version 1, by the version that added them. */
const OWNERS_ADDED: Record<number, string[]> = { 2: ["Roshni", "Yoo Jin", "Epshita", "Yeseul"] };
export const KIT_VERSION = 2;

export const KIT_GROUPS = ["Hair & make-up", "Paper & printing", "Camera & sound", "People & comfort", "Safety", "Wardrobe", "Loading & parking"] as const;

// Ids come from the group and position, so a starting list is only ever appended to.
const start = (group: string, labels: string[], suggested = false, owner = "", tag = suggested ? "s" : "a") =>
  labels.map((label, i) => ({
    id: `${group.toLowerCase().replace(/[^a-z]+/g, "-")}-${tag}${i}`,
    group, label, checked: false, custom: false, removed: false, suggested, owner,
  }));

/** The starting list: what was asked for, then suggestions. */
export const DEFAULT_KIT: KitItem[] = [
  ...start("Hair & make-up", ["Lint roller", "Make-up kit — brushes and powder", "Hairspray", "Comb", "Safety pins"]),
  ...start("Hair & make-up", ["Blotting papers (for shine)", "Make-up remover wipes", "Hair ties and bobby pins", "Hand mirror", "Tissues"], true),
  ...start("Paper & printing", ["Tape", "Printouts — door signs and the windshield notice", "Pens", "Markers", "Extra copies of everybody's scripts"]),
  ...start("Paper & printing", ["Release forms — one per person, plus spares", "Clipboards", "The day's schedule, printed", "Sticky notes"], true),
  ...start("Camera & sound", ["Camera batteries — charged, plus spares", "Memory cards — formatted, plus spares", "Chargers and a power bar", "Extension cords", "Gaffer tape (for cables)", "Laptop, card reader and a backup drive", "Headphones", "Lens cloth"], true),
  // (Snacks moved from the suggestions to Alison's list, below.)
  // (Snacks moved to Alison's list and the first-aid kit to Roshni's safety list, below.)
  ...start("People & comfort", ["Water and cups", "Snacks", "Hand sanitizer", "First-aid kit", "Phone chargers", "Garbage bags"], true).filter((i) => i.label !== "Snacks" && i.label !== "First-aid kit"),
  ...start("Wardrobe", ["Garment steamer", "A spare plain top — no busy patterns or logos"], true),
  ...start("Loading & parking", ["Cart or dolly for the gear", "The contractor's loading-dock details"], true),
  // Asked for later, with who is doing them.
  ...start("People & comfort", ["Lunch", "Coffee — morning, and a second box with lunch", "Snacks"], false, "Alison", "b"),
  ...start("Paper & printing", ["Print the signs and put them up"], false, "Roshni", "b"),
  // Roshni looks after safety on the day (researched 30 Sep 2026 — see the call sheet).
  ...start("Safety", [
    "First-aid kit — bring it, and keep it where everyone can see it",
    "Find the nearest AED: C. David Naylor Building, 1st floor by the elevators (none listed in FitzGerald)",
    "Walk the emergency exits at 8:30 and tell the team where they are",
    "Know the nearest ER: Mount Sinai, 600 University Ave (about 6 min walk); Toronto General, 190 Elizabeth St",
    "Emergency: 911 first, then U of T Campus Safety 416-978-2222 (non-emergency 416-978-2323)",
  ], false, "Roshni", "c"),
];

/**
 * Saved state over the starting list; anything unreadable is dropped.
 * Reads both the old shape (a bare list of items) and the new one
 * ({ items, owners }).
 */
export function mergeKit(raw: string | null | undefined): KitState {
  let saved: KitItem[] = [];
  let owners = DEFAULT_OWNERS;
  let seen = KIT_VERSION;
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
    saved = list.flatMap((x: unknown) => { const r = KitItemSchema.safeParse(x); return r.success ? [r.data] : []; });
    if (!Array.isArray(parsed) && Array.isArray(parsed?.owners)) {
      owners = parsed.owners.filter((o: unknown): o is string => typeof o === "string" && o.trim().length > 0).slice(0, 20);
      seen = typeof parsed.v === "number" ? parsed.v : 1;
    } else if (raw) seen = 1;
    // People added to the starting list since this one was saved join it once.
    for (let v = seen + 1; v <= KIT_VERSION; v++) {
      for (const name of OWNERS_ADDED[v] ?? []) if (!owners.includes(name)) owners = [...owners, name];
    }
  } catch { /* nothing saved that can be read */ }
  const byId = new Map(saved.map((i) => [i.id, i]));
  return {
    owners,
    v: KIT_VERSION,
    items: [
      ...DEFAULT_KIT.map((d) => { const s = byId.get(d.id); return s ? { ...d, checked: s.checked, removed: s.removed, label: s.label, owner: s.owner } : d; }),
      ...saved.filter((s) => s.custom),
    ],
  };
}
