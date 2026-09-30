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
  label: z.string().trim().min(1).max(120),
  checked: z.boolean(),
  /** Added here rather than on the starting list. */
  custom: z.boolean(),
  /** A starting item somebody took off the list. */
  removed: z.boolean().default(false),
  /** Put on the starting list as a suggestion rather than asked for. */
  suggested: z.boolean().default(false),
});
export type KitItem = z.infer<typeof KitItemSchema>;
export const KitSchema = z.array(KitItemSchema).max(300);

export const KIT_GROUPS = ["Hair & make-up", "Paper & printing", "Camera & sound", "People & comfort", "Wardrobe", "Loading & parking"] as const;

const start = (group: string, labels: string[], suggested = false) =>
  labels.map((label, i) => ({
    id: `${group.toLowerCase().replace(/[^a-z]+/g, "-")}-${suggested ? "s" : "a"}${i}`,
    group, label, checked: false, custom: false, removed: false, suggested,
  }));

/** The starting list: what was asked for, then suggestions. */
export const DEFAULT_KIT: KitItem[] = [
  ...start("Hair & make-up", ["Lint roller", "Make-up kit — brushes and powder", "Hairspray", "Comb", "Safety pins"]),
  ...start("Hair & make-up", ["Blotting papers (for shine)", "Make-up remover wipes", "Hair ties and bobby pins", "Hand mirror", "Tissues"], true),
  ...start("Paper & printing", ["Tape", "Printouts — door signs and the windshield notice", "Pens", "Markers", "Extra copies of everybody's scripts"]),
  ...start("Paper & printing", ["Release forms — one per person, plus spares", "Clipboards", "The day's schedule, printed", "Sticky notes"], true),
  ...start("Camera & sound", ["Camera batteries — charged, plus spares", "Memory cards — formatted, plus spares", "Chargers and a power bar", "Extension cords", "Gaffer tape (for cables)", "Laptop, card reader and a backup drive", "Headphones", "Lens cloth"], true),
  ...start("People & comfort", ["Water and cups", "Snacks", "Hand sanitizer", "First-aid kit", "Phone chargers", "Garbage bags"], true),
  ...start("Wardrobe", ["Garment steamer", "A spare plain top — no busy patterns or logos"], true),
  ...start("Loading & parking", ["Cart or dolly for the gear", "The contractor's loading-dock details"], true),
];

/** Saved state over the starting list; anything unreadable is dropped. */
export function mergeKit(raw: string | null | undefined): KitItem[] {
  let saved: KitItem[] = [];
  try {
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) saved = arr.flatMap((x) => { const r = KitItemSchema.safeParse(x); return r.success ? [r.data] : []; });
  } catch { /* nothing saved that can be read */ }
  const byId = new Map(saved.map((i) => [i.id, i]));
  return [
    ...DEFAULT_KIT.map((d) => { const s = byId.get(d.id); return s ? { ...d, checked: s.checked, removed: s.removed, label: s.label } : d; }),
    ...saved.filter((s) => s.custom),
  ];
}
