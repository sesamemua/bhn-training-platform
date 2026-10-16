import type { ShownRow } from "./registrant-views";
import type { CoordinatorInfo } from "@/lib/training-week/coordinator-info";

export type RegistrantColumn = "Name" | "Institution" | "Current role" | "Company / venture" | "Participation"
  | "Workshop" | "Workshops" | "Day" | "Decision" | "Email" | "Distance" | "Dietary" | "Accessibility" | "Choice";
export type RegistrantSort = { column: RegistrantColumn; direction: "ascending" | "descending" };

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });
const decisions: Record<string, string> = { pending: "Not decided", confirmed: "Approved", waitlist: "Waitlisted", cancelled: "Declined" };

export function sortRegistrantRows(
  rows: ShownRow[],
  sort: RegistrantSort,
  infoOf: (row: ShownRow) => CoordinatorInfo | undefined,
): ShownRow[] {
  const value = (r: ShownRow): string | number | null => {
    switch (sort.column) {
      case "Name": return r.name;
      case "Institution": return infoOf(r)?.institution ?? "";
      case "Current role": return infoOf(r)?.position ?? "";
      case "Company / venture": return infoOf(r)?.company ?? "";
      case "Participation": return infoOf(r)?.participation ?? "";
      case "Workshop": case "Workshops": return r.workshops.join("; ");
      case "Day": return r.day;
      case "Decision": return r.withdrawn ? "Can't attend" : decisions[r.status] ?? r.status;
      case "Email": return !r.email ? "Email missing" : r.letter === "owed" ? "Not sent" : r.letter === "sent" ? "Sent" : "";
      case "Distance": return r.falseOot ? "False OOT" : r.travel === "far" ? "Over 2 h" : r.travel === "near" ? "Local" : "";
      case "Dietary": return [...r.dietary.filter((d) => !/^(other|no dietary)/i.test(d)), r.dietaryOther && `Other: ${r.dietaryOther}`].filter(Boolean).join(" · ");
      case "Accessibility": return r.accessibility === "none" ? "" : r.accessibility;
      case "Choice": return r.preference;
    }
  };
  return rows.map((row) => ({ row, value: value(row) })).sort((a, b) => {
    // Unanswered fields stay at the bottom in either direction.
    const aMissing = a.value == null || a.value === "";
    const bMissing = b.value == null || b.value === "";
    if (aMissing || bMissing) return Number(aMissing) - Number(bMissing);
    const compared = typeof a.value === "number" && typeof b.value === "number"
      ? a.value - b.value : collator.compare(String(a.value), String(b.value));
    return sort.direction === "ascending" ? compared : -compared;
  }).map(({ row }) => row);
}
