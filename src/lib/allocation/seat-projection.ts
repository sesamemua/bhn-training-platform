import { validateRules, type Rule } from "./model";
import { suggestWeekSeats, type SuggestionWorkshop } from "./seat-suggestions";

/** Read-only forecast of applying the same whole-week plan as Seat suggestions. */
export function projectWeekSeats(workshops: SuggestionWorkshop[], rules: Rule[]) {
  const validation = validateRules(rules);
  // Include inactive rooms in planning: an existing seat there can still clash.
  const plan = validation.ok ? suggestWeekSeats(workshops, rules) : null;
  const rows = workshops.filter((w) => w.isActive).map((workshop) => {
    const students = workshop.bookings.filter((b) => !b.internal && !b.withdrawn && b.status !== "cancelled");
    const approved = students.filter((b) => b.status === "confirmed").length;
    const suggested = students.filter((b) => plan?.get(b.id)?.suggestion === "approve").length;
    const projectedApproved = approved + suggested;
    const projectedWaitlisted = students.filter((b) =>
      plan?.get(b.id)?.suggestion === "waitlist"
      || b.status === "waitlist" && plan?.get(b.id)?.suggestion !== "approve",
    ).length;
    const unresolved = students.length - projectedApproved - projectedWaitlisted;
    const capacity = Math.max(0, workshop.capacity);
    const warnings = new Set<string>();
    if (approved > capacity) warnings.add(`${approved - capacity} existing approvals over capacity.`);
    for (const b of students) {
      const reason = plan?.get(b.id)?.reason;
      if (b.status === "confirmed" && reason?.startsWith("Existing confirmed conflict")) warnings.add(reason);
    }
    return {
      id: workshop.id, capacity, requested: students.length, approved, suggested,
      projectedApproved, projectedWaitlisted, unresolved,
      remaining: Math.max(0, capacity - projectedApproved),
      internal: workshop.bookings.filter((b) => b.internal && !b.withdrawn && b.status === "confirmed").length,
      warnings: [...warnings],
    };
  });
  const totals = rows.reduce((acc, row) => ({
    requested: acc.requested + row.requested,
    capacity: acc.capacity + row.capacity,
    approved: acc.approved + row.approved,
    suggested: acc.suggested + row.suggested,
    projectedApproved: acc.projectedApproved + row.projectedApproved,
    projectedWaitlisted: acc.projectedWaitlisted + row.projectedWaitlisted,
    remaining: acc.remaining + row.remaining,
    internal: acc.internal + row.internal,
  }), { requested: 0, capacity: 0, approved: 0, suggested: 0, projectedApproved: 0, projectedWaitlisted: 0, remaining: 0, internal: 0 });
  return { rows, totals, problem: validation.ok ? null : validation.problem ?? "Invalid decision model." };
}
