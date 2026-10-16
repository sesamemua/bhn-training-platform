import { torontoToUtc } from "../training-week/schedule-2026";

export const SOCIAL_TIME_ZONE = "America/Toronto";
export const POSTING_TIME_SOURCE = "https://buffer.com/resources/best-time-to-post-on-linkedin/";

// Buffer's September 2026 research, ranked within each weekday; not account-specific analytics.
const TIMES = [
  ["22:00", "21:00", "06:00"],
  ["22:00", "17:00", "21:00"],
  ["16:00", "17:00", "22:00"],
  ["16:00", "15:00", "17:00"],
  ["17:00", "19:00", "21:00"],
  ["15:00", "16:00", "17:00"],
  ["09:00", "18:00", "22:00"],
] as const;

export function socialDate(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: SOCIAL_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
}

export function recommendedPostingTimes(day: string): readonly string[] {
  const date = new Date(`${day}T12:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day
    ? TIMES[date.getUTCDay()] : [];
}

export function socialScheduledInstant(day: string, time: string): Date {
  if (!recommendedPostingTimes(day).length || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Choose a valid date and time.");
  const instant = torontoToUtc(day, time);
  const matches = (date: Date) => socialDate(date) === day && date.toLocaleTimeString("en-GB", {
    timeZone: SOCIAL_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }) === time;
  if (!matches(instant)) throw new Error("That Toronto time does not exist because the clocks change. Choose another time.");
  if ([-1, 1].some(hours => matches(new Date(instant.getTime() + hours * 3_600_000)))) {
    throw new Error("That Toronto time occurs twice because the clocks change. Choose another time.");
  }
  return instant;
}
