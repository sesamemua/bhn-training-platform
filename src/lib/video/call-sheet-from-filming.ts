/**
 * The call sheet, rebuilt from the Filming day plan: who is called when,
 * and the day's running order, straight from the timeline — so the two
 * never disagree. Everything the plan does not know (parking, meals,
 * notes, phone numbers) is kept from the sheet as it was.
 *
 * Pure module.
 */
import type { CallSheetData, Person as SheetPerson, ScheduleRow } from "./call-sheet";
import { ON_CAMERA, filmStart, hhmmToMinutes, minuteOfDay, minutesToHhmm, type Block, type Person } from "./filming";

/** Researched 30 Sep 2026 (sinaihealth.ca, uhn.ca, campussafety.utoronto.ca). */
export const EMERGENCY_TEXT =
  "Emergency: call 911, then U of T Campus Safety 416-978-2222 (non-emergency 416-978-2323). " +
  "Nearest ER: Mount Sinai Hospital, 600 University Ave — entrance on the south side, drop-off on Murray St (about 6 min walk). " +
  "Also Toronto General, 190 Elizabeth St (about 8 min).";
export const SAFETY_TEXT =
  "Nearest AED: C. David Naylor Building (6 Queen's Park Cres W), 1st floor by the elevators — none is listed in the FitzGerald Building. " +
  "Roshni has the first-aid kit and walks the emergency exits at the start of the day.";

const hhmm = (iso: string) => minutesToHhmm(minuteOfDay(iso));
const GROUP: Record<string, SheetPerson["group"]> = { team: "team", crew: "crew", interviewee: "talent", trainee: "talent" };

export function sheetFromFilming(
  existing: CallSheetData,
  day: { location: string; opensAt: string; closesAt: string; notes: string },
  people: Person[],
  blocks: Block[],
): CallSheetData {
  const sorted = [...blocks].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? "";
  const first = (s: string) => s.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const was = (n: string) => existing.people.find((p) => p.name.toLowerCase() === n.toLowerCase())
    ?? existing.people.find((p) => first(p.name) === first(n));

  const sheetPeople: SheetPerson[] = people.map((p) => {
    const mine = sorted.filter((b) => b.people.includes(p.id) || b.facilitators.includes(p.id));
    const parts = mine.map((b) => {
      const film = minutesToHhmm(minuteOfDay(new Date(filmStart(b)).toISOString()));
      if (b.facilitators.includes(p.id)) return `facilitates ${b.title.replace(/^Interview — /, "")} ${hhmm(b.start)}`;
      if (ON_CAMERA.has(b.kind) && b.prepMinutes) return `${b.title.replace(/ — .*/, "")}: prep ${hhmm(b.start)}, filming ${film}–${hhmm(b.end)}`;
      return `${b.title} ${hhmm(b.start)}–${hhmm(b.end)}`;
    });
    const before = was(p.name);
    return {
      name: before?.name && first(before.name) === first(p.name) && before.name.length > p.name.length ? before.name : p.name,
      role: p.role,
      group: GROUP[p.group] ?? "crew",
      call: mine[0] ? hhmm(mine[0].start) : before?.call ?? "",
      phone: before?.phone ?? "",
      email: p.email || before?.email || "",
      notes: parts.join("; ").slice(0, 400),
    };
  });

  const schedule: ScheduleRow[] = sorted.map((b) => {
    const who = b.people.map(name).filter(Boolean).join(", ");
    const facs = b.facilitators.map(name).filter(Boolean);
    const film = minutesToHhmm(minuteOfDay(new Date(filmStart(b)).toISOString()));
    const notes = [
      ON_CAMERA.has(b.kind) && b.prepMinutes ? `Prep ${hhmm(b.start)}–${film}, filming ${film}–${hhmm(b.end)}` : "",
      b.flexible ? "Time not fixed" : "",
      b.notes,
    ].filter(Boolean).join(" · ");
    return {
      time: hhmm(b.start), end: hhmm(b.end), item: b.title.slice(0, 240),
      who: [who, facs.length ? `facilitators: ${facs.join(", ")}` : ""].filter(Boolean).join("; ").slice(0, 240),
      notes: notes.slice(0, 400),
    };
  });

  const [place, ...rest] = day.location.split(",");
  const lastEnd = Math.max(hhmmToMinutes(day.closesAt), ...blocks.map((b) => minuteOfDay(b.end)));
  return {
    ...existing,
    generalCall: day.opensAt,
    wrap: minutesToHhmm(lastEnd),
    locationName: place?.trim() || existing.locationName,
    locationAddress: rest.length ? `${rest.join(",").trim()}, Toronto, ON` : existing.locationAddress,
    locationNotes: [day.notes, SAFETY_TEXT].filter(Boolean).join("\n").slice(0, 1000),
    hospital: EMERGENCY_TEXT.slice(0, 500),
    people: sheetPeople.slice(0, 100),
    schedule: schedule.slice(0, 100),
  };
}
