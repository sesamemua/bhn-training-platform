/**
 * Call sheets for Workspace → Video Production.
 *
 * One row per shoot day (CallSheet). Title and date are columns so the
 * list can sort; everything else — location, logistics, people, schedule —
 * is one JSON document, validated here on every write.
 */
import { z } from "zod";

const text = (max: number) => z.string().trim().max(max).default("");

export const PERSON_GROUPS = ["crew", "talent", "team", "vendor"] as const;
export type PersonGroup = (typeof PERSON_GROUPS)[number];
export const GROUP_LABEL: Record<PersonGroup, string> = {
  crew: "Crew",
  talent: "On camera",
  team: "BHN team",
  vendor: "Vendors",
};

export const PersonSchema = z.object({
  name: text(120),
  role: text(160),
  group: z.enum(PERSON_GROUPS).default("crew"),
  call: text(20),
  phone: text(60),
  email: text(160),
  notes: text(400),
});

export const ScheduleRowSchema = z.object({
  time: text(20),
  end: text(20),
  item: text(240),
  who: text(240),
  notes: text(400),
});

export const CallSheetDataSchema = z.object({
  production: text(160),
  dayLabel: text(80),
  generalCall: text(20),
  wrap: text(20),
  locationName: text(200),
  locationAddress: text(300),
  locationNotes: text(1000),
  parking: text(1000),
  meals: text(1000),
  hospital: text(500),
  weather: text(300),
  equipment: text(2000),
  notes: text(4000),
  people: z.array(PersonSchema).max(100).default([]),
  schedule: z.array(ScheduleRowSchema).max(100).default([]),
});

export type Person = z.infer<typeof PersonSchema>;
export type ScheduleRow = z.infer<typeof ScheduleRowSchema>;
export type CallSheetData = z.infer<typeof CallSheetDataSchema>;

export const CallSheetInputSchema = z.object({
  title: z.string().trim().min(1, "Give the call sheet a title.").max(160),
  /** YYYY-MM-DD, or empty for "not set yet". */
  shootDate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).default(""),
  data: CallSheetDataSchema,
});
export type CallSheetInput = z.infer<typeof CallSheetInputSchema>;

/** Whatever is stored, read back as a complete document (old rows included). */
export function parseCallSheetData(raw: unknown): CallSheetData {
  const r = CallSheetDataSchema.safeParse(raw ?? {});
  return r.success ? r.data : CallSheetDataSchema.parse({});
}

export const blankPerson = (group: PersonGroup = "crew"): Person => PersonSchema.parse({ group });
export const blankScheduleRow = (): ScheduleRow => ScheduleRowSchema.parse({});
export const blankCallSheet = (): CallSheetInput => ({ title: "New call sheet", shootDate: "", data: CallSheetDataSchema.parse({}) });

// ── The prebuilt sheet: BHN Promo Video, shoot day Tue 6 Oct 2026 ─────────
// Built from what is on file: the Molly interview guide (1.5 h with Molly,
// half an hour each with Gilbert and Darius), the production-cost page
// (vendors, parking, lunch list), and the 2D House / CamArt quotes. Times
// are a draft; anything not on file says TBC rather than being guessed.
export const BHN_PROMO_CALL_SHEET_ID = "callsheet_bhn_promo_2026_10_06";

export const BHN_PROMO_CALL_SHEET: CallSheetInput = {
  title: "BHN Promo Video — Shoot day",
  shootDate: "2026-10-06",
  data: CallSheetDataSchema.parse({
    production: "BHN Promo Video — BioHubNet Scientific Directors",
    dayLabel: "Day 2 of 3 · shoot day (Mon 5 pickup · Wed 7 return)",
    generalCall: "08:00",
    wrap: "16:00",
    locationName: "U of T St. George campus — lab and interview room TBC",
    locationAddress: "Toronto, ON",
    locationNotes: "Molly's interview, then B-roll with students in the lab. Confirm the room, power and access with the lab before Friday 2 Oct.",
    parking:
      "Landmark Garage, 35 Hart House Circle (under King's College Circle). Enter from Wellesley St. West only. $22 day maximum. " +
      "Two spots: Ruilin's car and the lighting / sound technician's truck (confirmed to fit the 2.4 m clearance).",
    meals: "Coffee on arrival: 2 Tim Hortons coffee boxes. Lunch at 12:00 for 10 — U of T lunch allowance, $25 a person.",
    hospital: "Toronto General Hospital — Emergency, 200 Elizabeth St. In an emergency call 911.",
    weather: "Check the forecast on Monday 5 Oct.",
    equipment:
      "Camera: 2D House, quote 263434 (ARRI Alexa Mini LF package) — pick up Mon 5 Oct after 12:00, return Wed 7 Oct before 12:00. Payment due on pickup.\n" +
      "Lens: William White — Caldwell Chameleon 75 mm anamorphic, full frame.\n" +
      "Sound & lighting: CamArt Productions, quote 1237 — sound kit, 8 ft softbox, 6×6 frame, Aputure 600x if needed.\n" +
      "Insurance certificate to both rental houses before pickup.",
    notes:
      "Everyone on camera signs a filming release before they are filmed.\n" +
      "Molly leads; Gilbert and Darius have shorter, focused segments — see the interview guide under Projects.\n" +
      "Capture the optional 2026 Symposium pickup line with Molly if time allows.",
    people: [
      { name: "Ruilin Yuan", role: "Producer — Marketing & Communications Officer, BHN", group: "team", call: "07:30", email: "ruilin.yuan@utoronto.ca", notes: "Parking, coffee, releases" },
      { name: "Darek Zdzienicki", role: "Director of Photography — CamArt Productions", group: "crew", call: "08:00" },
      { name: "Lighting / sound technician", role: "Sound mixer + lighting — CamArt Productions", group: "crew", call: "08:00", notes: "Name TBC. Truck parks at Landmark Garage." },
      { name: "Molly", role: "Scientific Director — lead voice", group: "talent", call: "09:15", notes: "1.5 h: interview + lab B-roll" },
      { name: "Gilbert", role: "Scientific Director — industry & translation", group: "talent", call: "10:45", notes: "30 min" },
      { name: "Darius", role: "Scientific Director — innovation & future science", group: "talent", call: "11:15", notes: "30 min" },
      { name: "Epshita Islam", role: "ENGAGE pillar lead", group: "team", call: "12:00", notes: "Lunch; pickups TBC" },
      { name: "Yeseul Lee", role: "EXPERIENCE pillar lead", group: "team", call: "12:00", notes: "Lunch; pickups TBC" },
      { name: "Roshni", role: "EQUIP pillar lead", group: "team", call: "12:00", notes: "Lunch; pickups TBC" },
      { name: "Yoo Jin", role: "BHN team", group: "team", call: "12:00" },
      { name: "Alison", role: "BHN team", group: "team", call: "12:00" },
      { name: "Vickie Sprenger", role: "2D House — camera rental", group: "vendor", phone: "(416) 800-2193 ext. 201", email: "vickie@2dhouse.com", notes: "230 New Toronto St, Unit 1" },
      { name: "William White", role: "Lens rental — Caldwell Chameleon 75 mm", group: "vendor", notes: "Contact TBC" },
    ].map((p) => PersonSchema.parse(p)),
    schedule: [
      { time: "07:30", end: "08:00", item: "Producer on site — parking, coffee, releases", who: "Ruilin" },
      { time: "08:00", end: "08:15", item: "Crew call — load in from Landmark Garage", who: "Darek, technician" },
      { time: "08:15", end: "09:30", item: "Set lights, sound and camera; test shots", who: "Crew" },
      { time: "09:30", end: "10:15", item: "Molly — interview (four prompts)", who: "Molly", notes: "Interview guide → Molly tab" },
      { time: "10:15", end: "11:00", item: "Molly — B-roll in the lab with students", who: "Molly, students", notes: "Symposium pickup line if time allows" },
      { time: "11:00", end: "11:30", item: "Gilbert — industry & translation", who: "Gilbert" },
      { time: "11:30", end: "12:00", item: "Darius — innovation & future science", who: "Darius" },
      { time: "12:00", end: "12:45", item: "Lunch", who: "All (10)" },
      { time: "12:45", end: "14:30", item: "Pillar lead pickups / extra coverage (TBC)", who: "Epshita, Yeseul, Roshni" },
      { time: "14:30", end: "15:30", item: "B-roll — lab, corridors, exteriors", who: "Crew" },
      { time: "15:30", end: "16:00", item: "Wrap, strike, load out", who: "Crew" },
    ].map((r) => ScheduleRowSchema.parse(r)),
  }),
};
