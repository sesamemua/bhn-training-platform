/**
 * Which of one person's session choices run at the same time.
 *
 * Pure module: no React, no Prisma.
 */
export type SeatTimes = { start?: string; end?: string; status: string };
/** Sets of a person's still-live choices that run at the same time, as row indexes. One set per overlapping cluster. */
export function clashGroups(seats: SeatTimes[]): number[][] {
  const t = (s?: string) => (s ? new Date(s).getTime() : NaN);
  const clash = (a: SeatTimes, b: SeatTimes) => t(a.start) < t(b.end) && t(b.start) < t(a.end);
  const seen = new Set<number>();
  const out: number[][] = [];
  seats.forEach((s, i) => {
    if (seen.has(i) || s.status === "cancelled") return;
    // Grow the cluster: anything live that overlaps a member joins it.
    const group = [i];
    for (let k = 0; k < group.length; k++) {
      seats.forEach((o, j) => { if (!group.includes(j) && o.status !== "cancelled" && clash(seats[group[k]], o)) group.push(j); });
    }
    group.forEach((j) => seen.add(j));
    if (group.length > 1) out.push(group.sort((a, b) => a - b));
  });
  return out;
}
