/**
 * Call sheets for Workspace → Video Production.
 *
 * One row per shoot day (CallSheet). Title and date are columns so the
 * list can sort; everything else — location, logistics, people, schedule —
 * is one JSON document, validated here on every write.
 */
import { z } from "zod";

const text = (max: number) => z.string().trim().max(max).default("");

// "vendor" stays readable for older sheets, but a call sheet no longer
// lists suppliers — contracts and rentals are not the crew's business.
export const PERSON_GROUPS = ["crew", "talent", "team", "vendor"] as const;
export const SHEET_GROUPS = ["talent", "crew", "team"] as const;
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
// Built from what is on file: the BHN Promo Video guide (Molly 1.5 h,
// Gilbert and Darius 30 min each, the pillar scripts, Yoo Jin on the
// pillars, the Year in Review parts) and the lunch list. Times are a draft,
// finishing by 17:00; anything not on file says TBC rather than being
// guessed. No contract, rental or cost detail — that lives on Production cost.
export const BHN_PROMO_CALL_SHEET_ID = "callsheet_bhn_promo_2026_10_06";

export const BHN_PROMO_CALL_SHEET: CallSheetInput = {
  title: "BHN Promo Video — Shoot day",
  shootDate: "2026-10-06",
  data: CallSheetDataSchema.parse({
    production: "BHN Promo Video — homepage, pillar and Symposium videos",
    dayLabel: "Day 1 of 1",
    generalCall: "08:00",
    wrap: "17:00",
    locationName: "U of T St. George campus — lab and interview room TBC",
    locationAddress: "Toronto, ON",
    locationNotes: "Interviews in one room; lab B-roll with students. Confirm the rooms, power and access with the lab before Friday 2 Oct.",
    parking:
      "Landmark Garage, 35 Hart House Circle (under King's College Circle). Enter from Wellesley St. West only. " +
      "Two spots: Ruilin's car and Darek's truck.",
    meals: "Coffee on arrival (Tim Hortons). Lunch at 12:15 for 10.",
    hospital: "Toronto General Hospital — Emergency, 200 Elizabeth St. In an emergency call 911.",
    weather: "Check the forecast on Monday 5 Oct.",
    equipment: "",
    notes:
      "Everyone on camera signs a filming release before they are filmed.\n" +
      "Three pieces are shot today: the BHN homepage video (the Scientific Directors on the initiative, Yoo Jin on the three pillars), " +
      "the pillar videos (ENGAGE, EXPERIENCE, EQUIP), and Symposium content — each pillar lead's highlights of the year and the Scientific Directors' Year in Review lines.\n" +
      "Scripts and prompts: Workspace → Video Production → BHN Promo Video.",
    people: [
      { name: "Molly", role: "Scientific Director — homepage video lead voice; Year in Review", group: "talent", call: "09:15", notes: "09:30–11:00: interview, Year in Review lines, lab B-roll" },
      { name: "Epshita Islam", role: "ENGAGE pillar lead — pillar video; year highlights", group: "talent", call: "10:45", notes: "11:00–11:25" },
      { name: "Yeseul Lee", role: "EXPERIENCE pillar lead — pillar video; year highlights", group: "talent", call: "11:10", notes: "11:25–11:50" },
      { name: "Roshni", role: "EQUIP pillar lead — pillar video; year highlights", group: "talent", call: "11:35", notes: "11:50–12:15" },
      { name: "Gilbert", role: "Scientific Director — homepage video; Year in Review", group: "talent", call: "12:45", notes: "13:00–13:30" },
      { name: "Darius", role: "Scientific Director — homepage video; Year in Review", group: "talent", call: "13:15", notes: "13:30–14:00" },
      { name: "Yoo Jin", role: "Homepage video — the three pillars", group: "talent", call: "13:45", notes: "14:00–14:30" },
      { name: "Ruilin Yuan", role: "Producer & Director — BHN Marketing & Communications", group: "crew", call: "07:30", email: "ruilin.yuan@utoronto.ca", notes: "Parking, coffee, releases" },
      { name: "Darek Zdzienicki", role: "Sound & lighting — CamArt Productions", group: "crew", call: "08:00", notes: "Truck parks at Landmark Garage" },
      { name: "Alison", role: "BHN team", group: "team", call: "12:15", notes: "Lunch" },
    ].map((p) => PersonSchema.parse(p)),
    schedule: [
      { time: "07:30", end: "08:00", item: "Producer on site — parking, coffee, releases", who: "Ruilin" },
      { time: "08:00", end: "08:15", item: "Crew call — load in from Landmark Garage", who: "Darek" },
      { time: "08:15", end: "09:30", item: "Set lights, sound and camera; test shots", who: "Ruilin, Darek" },
      { time: "09:30", end: "10:15", item: "Molly — homepage video interview", who: "Molly", notes: "Guide → Molly tab" },
      { time: "10:15", end: "10:40", item: "Molly — Year in Review lines", who: "Molly", notes: "Guide → Year in Review tab" },
      { time: "10:40", end: "11:00", item: "Molly — B-roll in the lab with students", who: "Molly, students" },
      { time: "11:00", end: "11:25", item: "ENGAGE — pillar video + year highlights", who: "Epshita", notes: "Guide → Pillar leads → ENGAGE" },
      { time: "11:25", end: "11:50", item: "EXPERIENCE — pillar video + year highlights", who: "Yeseul", notes: "Guide → Pillar leads → EXPERIENCE" },
      { time: "11:50", end: "12:15", item: "EQUIP — pillar video + year highlights", who: "Roshni", notes: "Guide → Pillar leads → EQUIP" },
      { time: "12:15", end: "13:00", item: "Lunch", who: "All (10)" },
      { time: "13:00", end: "13:30", item: "Gilbert — homepage video + Year in Review lines", who: "Gilbert" },
      { time: "13:30", end: "14:00", item: "Darius — homepage video + Year in Review lines", who: "Darius" },
      { time: "14:00", end: "14:30", item: "Yoo Jin — homepage video: the three pillars", who: "Yoo Jin", notes: "Guide → Yoo Jin tab" },
      { time: "14:30", end: "16:15", item: "B-roll — lab, corridors, exteriors; pickups", who: "Ruilin, Darek" },
      { time: "16:15", end: "17:00", item: "Wrap, strike, load out", who: "Ruilin, Darek" },
    ].map((r) => ScheduleRowSchema.parse(r)),
  }),
};
