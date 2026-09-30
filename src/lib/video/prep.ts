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
});
export type PrepTask = z.infer<typeof PrepTaskSchema>;
export type PrepItem = z.infer<typeof ItemSchema>;
export const PrepSchema = z.array(PrepTaskSchema).max(100);

const items = (id: string, labels: string[]): PrepItem[] => labels.map((label, i) => ({ id: `${id}-${i}`, label, checked: false }));

/** The starting tasks. `who` is matched to people on the filming day by name. */
export const DEFAULT_PREP: (Omit<PrepTask, "people"> & { who: string[] })[] = [
  { id: "prep-camera-pickup", title: "Pick up the camera", who: ["Ruilin"], done: false, notes: "", items: [], removed: false, custom: false },
  { id: "prep-camera-test", title: "Test the camera", who: ["Ruilin"], done: false, notes: "", items: [], removed: false, custom: false },
  {
    id: "prep-gear", title: "Prepare my gear", who: ["Ruilin"], done: false, notes: "", removed: false, custom: false,
    items: items("gear", [
      "Light", "Softbox", "Light stand", "Extension cords (two)", "Sound recorder", "Sound bag", "Batteries", "Chargers",
      "Boom microphone", "Wireless lavalier microphones", "Headphones", "Slate", "Spotlight with Fresnel lens", "Make-up kits",
    ]),
  },
  { id: "prep-students-confirm", title: "Final confirmation with the students", who: [], done: false, notes: "Whoever has been in touch with the students confirms they are coming, and when.", items: [], removed: false, custom: false },
  { id: "prep-dietary", title: "Collect dietary requirements", who: [], done: false, notes: "Everybody on the day — for lunch and the coffee.", items: [], removed: false, custom: false },
];

/** Saved state over the starting tasks, `who` resolved to people's ids; junk dropped. */
export function mergePrep(raw: string | null | undefined, people: { id: string; name: string }[]): PrepTask[] {
  let saved: PrepTask[] = [];
  try {
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) saved = arr.flatMap((x) => { const r = PrepTaskSchema.safeParse(x); return r.success ? [r.data] : []; });
  } catch { /* nothing readable saved */ }
  const byId = new Map(saved.map((t) => [t.id, t]));
  const idsOf = (names: string[]) => names.flatMap((n) => people.filter((p) => p.name.toLowerCase() === n.toLowerCase()).map((p) => p.id));
  return [
    ...DEFAULT_PREP.map(({ who, ...d }) => byId.get(d.id) ?? { ...d, people: idsOf(who) }),
    ...saved.filter((t) => t.custom),
  ];
}
