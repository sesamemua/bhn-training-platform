/**
 * The prep day before a shoot: tasks, who is on each, ticked off when
 * done. A task can carry its own checklist — "Prepare my gear" is the
 * list of gear. Kept per project; the starting tasks are laid under
 * whatever was saved, so a task somebody deleted stays deleted.
 *
 * Pure module: no React, no Prisma.
 */
import { z } from "zod";

export const prepKey = (projectId: string) => `video.prep.${projectId}`;
/** The weeks before: the Before the shoot tab's list, same shape. */
export const preshootKey = (projectId: string) => `video.preshoot.${projectId}`;
export const PREP_LISTS = ["prep", "preshoot"] as const;
export type PrepList = (typeof PREP_LISTS)[number];
export const keyFor = (list: PrepList, projectId: string) => (list === "preshoot" ? preshootKey(projectId) : prepKey(projectId));

const ItemSchema = z.object({ id: z.string().min(1).max(40), label: z.string().trim().min(1).max(120), checked: z.boolean() });
export const PrepTaskSchema = z.object({
  id: z.string().min(1).max(40),
  title: z.string().trim().min(1).max(160),
  /** FilmingPerson ids. */
  people: z.array(z.string().max(40)).max(20),
  done: z.boolean(),
  notes: z.string().max(1000).default(""),
  items: z.array(ItemSchema).max(60).default([]),
  /** A starting task somebody took off. */
  removed: z.boolean().default(false),
  custom: z.boolean().default(false),
  /** "YYYY-MM-DD", or "" for no date. */
  due: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).default(""),
  /** Put on the starting list as a suggestion rather than asked for. */
  suggested: z.boolean().default(false),
});
export type PrepTask = z.infer<typeof PrepTaskSchema>;
export type PrepItem = z.infer<typeof ItemSchema>;
export const PrepSchema = z.array(PrepTaskSchema).max(100);

const items = (id: string, labels: string[]): PrepItem[] => labels.map((label, i) => ({ id: `${id}-${i}`, label, checked: false }));

/** The starting tasks. `who` is matched to people on the filming day by name. */
type Starting = Omit<PrepTask, "people" | "due" | "suggested"> & { who: string[]; due?: string; suggested?: boolean };
export const DEFAULT_PREP: Starting[] = [
  { id: "prep-camera-pickup", title: "Pick up the camera", who: ["Ruilin"], done: false, notes: "", items: [], removed: false, custom: false },
  { id: "prep-camera-test", title: "Test the camera", who: ["Ruilin"], done: false, notes: "", items: [], removed: false, custom: false },
  {
    id: "prep-gear", title: "Prepare my gear", who: ["Ruilin"], done: false, notes: "", removed: false, custom: false,
    items: items("gear", [
      "Light", "Softbox", "Light stand", "Extension cords (two)", "Sound recorder", "Sound bag", "Batteries", "Chargers",
      "Boom microphone", "Wireless lavalier microphones", "Headphones", "Slate", "Spotlight with Fresnel lens", "Make-up kits",
    ]),
  },
  {
    id: "prep-storage", title: "Get the footage drives ready", who: ["Ruilin"], done: false, removed: false, custom: false,
    notes: "Sizes, when to copy and what to buy: the Storage card below.",
    items: items("storage", [
      "Buy the drives (Staples, 375 University Ave)", "Plug in and test each drive; name them", "Format them (exFAT, or APFS if Mac only)",
      "Offload app with checksum copy installed and tried on a test clip", "Rental: Codex reader and how many 1 TB mags", "Laptop charged; a USB-C port for the reader and each drive",
    ]),
  },
  { id: "prep-students-confirm", title: "Final confirmation with the students", who: [], done: false, notes: "Whoever has been in touch with the students confirms they are coming, and when.", items: [], removed: false, custom: false },
  { id: "prep-dietary", title: "Collect dietary requirements", who: [], done: false, notes: "Everybody on the day — for lunch and the coffee.", items: [], removed: false, custom: false },
];

/** Saved state over the starting tasks, `who` resolved to people's ids; junk dropped. */
export function mergePrep(raw: string | null | undefined, people: { id: string; name: string }[], defaults: typeof DEFAULT_PREP = DEFAULT_PREP): PrepTask[] {
  let saved: PrepTask[] = [];
  try {
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) saved = arr.flatMap((x) => { const r = PrepTaskSchema.safeParse(x); return r.success ? [r.data] : []; });
  } catch { /* nothing readable saved */ }
  const byId = new Map(saved.map((t) => [t.id, t]));
  const idsOf = (names: string[]) => names.flatMap((n) => people.filter((p) => p.name.toLowerCase() === n.toLowerCase()).map((p) => p.id));
  return [
    ...defaults.map(({ who, ...d }) => byId.get(d.id) ?? { due: "", suggested: false, ...d, people: idsOf(who) }),
    ...saved.filter((t) => t.custom),
  ];
}

const task = (id: string, title: string, who: string[], due: string, notes = "", suggested = false): Starting =>
  ({ id, title, who, due, notes, suggested, done: false, items: [], removed: false, custom: false });

/**
 * Before the shoot: what has to be done in the days ahead, with who is on
 * it and by when. The team's own list first; suggestions are marked and
 * can be deleted. The BHN Promo shoot is Tuesday 6 October 2026.
 */
export const DEFAULT_PRESHOOT: Starting[] = [
  task("pre-rental-form", "Fill out the account form for the camera rental house", ["Ruilin"], "2026-10-01"),
  task("pre-rental-confirm", "Confirm the rental booking", ["Ruilin"], "2026-10-02"),
  task("pre-insurance", "Insurance for the rented equipment", ["Ruilin"], "2026-10-02"),
  task("pre-script-engage", "Finalise the ENGAGE pillar script", ["Epshita"], "2026-10-02"),
  task("pre-script-experience", "Finalise the EXPERIENCE pillar script", ["Yeseul"], "2026-10-02"),
  task("pre-script-equip", "Finalise the EQUIP pillar script", ["Roshni"], "2026-10-02"),
  task("pre-script-yoojin", "Develop and finalise Yoo Jin's script — the three pillars", ["Yoo Jin"], "2026-10-02"),
  task("pre-call-sheets", "Send out the call sheets", [], "2026-10-02", "Everyone gets their times, where to go, and what to wear."),
  task("pre-students-contact", "Contact the students", [], "2026-10-01", "Molly's students, for the interviews and the lab shots — names still to come."),
  task("pre-students-confirm", "Confirm with the students — names, times, and the release form", [], "2026-10-02"),
  task("pre-permit", "Filming permit from Campus Events & Conference Services", ["Ruilin"], "2026-09-30",
    "Required for filming in St. George buildings; they take up to 15 business days — ask today. campusevents@utoronto.ca", true),
  task("pre-room", "Confirm the FitzGerald Atrium booking and access, 8:30–5", [], "2026-10-01", "", true),
  task("pre-mags", "Ask the rental house for a second 1 TB Compact Drive and the Codex reader", ["Ruilin"], "2026-10-02",
    "With one mag the camera stops for about 45 minutes while it is copied (Prep day → Storage).", true),
  task("pre-parking", "Confirm parking and loading-dock access for Darek's truck", ["Ruilin"], "2026-10-02", "", true),
  task("pre-darek", "Confirm Darek: 10:30 call, the loading dock, what he brings", ["Ruilin"], "2026-10-02", "", true),
  task("pre-lunch", "Order lunch and coffee (dietary needs from the Prep day list)", ["Alison"], "2026-10-02", "", true),
  task("pre-lab", "Confirm Molly's lab for the lab shots, and which of her two times", [], "2026-10-02", "", true),
  task("pre-releases", "Print the release forms — one per person on camera, plus spares", ["Roshni"], "2026-10-05", "", true),
];
