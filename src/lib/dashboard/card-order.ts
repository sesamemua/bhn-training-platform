import { z } from "zod";

export const DASHBOARD_CARD_LABELS = {
  symposium: "Annual Symposium registration",
  speakers: "Headshots & bios action items",
  released: "Seats released",
  capacity: "Training Week capacity",
  registration: "Training Week registration",
  marketing: "Social pulse",
} as const;
export type DashboardCard = keyof typeof DASHBOARD_CARD_LABELS;
export const DEFAULT_CARD_ORDER = Object.keys(DASHBOARD_CARD_LABELS) as DashboardCard[];
export const CardOrderSchema = z.array(z.enum(["symposium", "speakers", "released", "capacity", "registration", "marketing"]))
  .length(DEFAULT_CARD_ORDER.length).refine((order) => new Set(order).size === DEFAULT_CARD_ORDER.length, "Include every card exactly once.");
export type DashboardLayout = { order: DashboardCard[]; version: string | null };

export function moveDashboardCard(order: DashboardCard[], id: DashboardCard, direction: -1 | 1) {
  const next = [...order], index = next.indexOf(id), destination = index + direction;
  if (index < 0 || destination < 0 || destination >= next.length) return next;
  [next[index], next[destination]] = [next[destination], next[index]];
  return next;
}
