import { z } from "zod";
import { SYMPOSIUM_CAMPAIGN_PLAN } from "./symposium-campaign";

export const DEFAULT_SOCIAL_ORDER = [
  "symposium-2026-keynote-promotion-oct13",
  "symposium-2026-ai-panel-oct21",
  "symposium-2026-careers-connections-oct22",
  "symposium-2026-on-the-day-photo-oct29",
  "symposium-2026-week-ahead-oct23",
  "training-week-2026-pandemic-promotion-oct13",
  "training-week-2026-day-one-photo-oct26",
  "training-week-2026-communication-promotion-oct13",
  "training-week-2026-negotiation-promotion-oct13",
  "training-week-2026-day-two-photo-oct27",
  "training-week-2026-innovation-promotion-oct13",
  "training-week-2026-innovation-photo-oct28",
];
const campaignSlugs = new Set(SYMPOSIUM_CAMPAIGN_PLAN.map((post) => post.slug));
export const SocialOrderSchema = z.array(z.string().max(160)).length(campaignSlugs.size)
  .refine((order) => new Set(order).size === campaignSlugs.size && order.every((slug) => campaignSlugs.has(slug)), "Include every campaign post exactly once.");
export type SocialOrder = { order: string[]; version: string | null };

export function sortSocialPosts<T extends { campaignSlug?: string; scheduledFor: string; id: string }>(posts: T[], order: string[]) {
  const rank = new Map(order.map((slug, index) => [slug, index]));
  return [...posts].sort((a, b) => (rank.get(a.campaignSlug ?? "") ?? Number.MAX_SAFE_INTEGER)
    - (rank.get(b.campaignSlug ?? "") ?? Number.MAX_SAFE_INTEGER)
    || a.scheduledFor.localeCompare(b.scheduledFor) || a.id.localeCompare(b.id));
}

export function moveSocialPost(order: string[], slug: string, direction: -1 | 1, visible = order) {
  const shown = order.filter((key) => visible.includes(key));
  const index = shown.indexOf(slug), neighbor = shown[index + direction];
  const next = [...order];
  if (index < 0 || !neighbor) return next;
  const from = next.indexOf(slug), to = next.indexOf(neighbor);
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
