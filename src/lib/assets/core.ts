/**
 * Digital asset library — the rules, with no I/O.
 *
 * Shared by the API, the library page and the Social publish gate, so
 * "can this picture go out?" has one answer everywhere.
 */
import { z } from "zod";

export const ASSET_FOLDERS = ["General", "Events", "Social", "Brand", "People", "EQUIP", "Sponsors", "Reports"] as const;

export const CONSENT = ["given", "not_needed", "unknown", "refused"] as const;
export type Consent = (typeof CONSENT)[number];
export const CONSENT_LABEL: Record<Consent, string> = {
  given: "Consent given",
  not_needed: "No consent needed",
  unknown: "Consent unknown",
  refused: "Consent refused",
};

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
/**
 * Upload cap per file. Vercel refuses request bodies over 4.5 MB, so the
 * library shrinks bigger photos in the browser (fitPicture) to fit this.
 */
export const MAX_ASSET_BYTES = 4_300_000;
export const TRASH_DAYS = 30;
const DAY = 86_400_000;

/** Ready-made sizes, cropped around the subject (sharp's attention strategy). */
export const RENDITIONS = {
  linkedin: { label: "LinkedIn post · 1200×627", width: 1200, height: 627 },
  square: { label: "Square · 1080×1080", width: 1080, height: 1080 },
  portrait: { label: "LinkedIn portrait · 1080×1350", width: 1080, height: 1350 },
  story: { label: "Story · 1080×1920", width: 1080, height: 1920 },
  banner: { label: "Banner · 1584×396", width: 1584, height: 396 },
} as const;
export type RenditionKey = keyof typeof RENDITIONS;

export interface RightsFacts {
  consent: string;
  people: string | null;
  expiresAt: Date | string | null;
  deletedAt?: Date | string | null;
}

/**
 * Why this asset may not be published, or null if it may.
 *
 * A photo naming people needs their consent recorded; "unknown" is not
 * a yes. A refusal blocks even with nobody named — someone said no.
 */
export function publishBlock(a: RightsFacts, now: Date = new Date()): string | null {
  if (a.deletedAt) return "This picture is in the trash.";
  if (a.expiresAt && new Date(a.expiresAt).getTime() <= now.getTime()) return "The licence for this picture has expired.";
  if (a.consent === "refused") return "Someone in this picture refused consent.";
  if (a.people?.trim() && a.consent !== "given") return `Record consent for ${a.people.trim()} before publishing this picture.`;
  return null;
}

/** Trashed long enough ago to purge for good. */
export function isPurgeable(deletedAt: Date | string | null, now: Date = new Date()): boolean {
  return !!deletedAt && now.getTime() - new Date(deletedAt).getTime() >= TRASH_DAYS * DAY;
}

/** "summit, Panel 2 ,  summit" → ["panel 2", "summit"] — lower-case, unique, sorted. */
export function normalizeTags(input: string[] | string): string[] {
  const list = Array.isArray(input) ? input : input.split(",");
  return [...new Set(list.map((t) => t.trim().toLowerCase().replace(/\s+/g, " ")).filter((t) => t && t.length <= 40))].sort().slice(0, 30);
}

/** A readable title from a file name: "IMG_0412-panel_2.JPG" → "IMG 0412 panel 2". */
export function titleFromFileName(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "Untitled";
}

/** Squared distance between two #rrggbb colours (0 = identical). */
export function colorDistance(a: string, b: string): number {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return x.reduce((s, v, i) => s + (v - y[i]) ** 2, 0);
}

/** Swatches offered as colour filters; an asset matches its nearest one. */
export const SWATCHES = {
  red: "#d6453d", orange: "#ef8a2c", yellow: "#f2c94c", green: "#3fa66a", teal: "#2a9d8f",
  blue: "#2f6fd0", purple: "#7b5cd6", pink: "#e06aa3", brown: "#8a5a3c", black: "#222222", grey: "#9a9a9a", white: "#f4f4f4",
} as const;
export type Swatch = keyof typeof SWATCHES;
export function nearestSwatch(hex: string): Swatch {
  return (Object.keys(SWATCHES) as Swatch[]).reduce((best, k) => colorDistance(hex, SWATCHES[k]) < colorDistance(hex, SWATCHES[best]) ? k : best, "grey");
}

/** Edits a person may make to an asset's record. */
export const AssetPatch = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  folder: z.enum(ASSET_FOLDERS).optional(),
  tags: z.array(z.string()).max(30).optional(),
  caption: z.string().trim().max(1000).nullable().optional(),
  altText: z.string().trim().max(300).nullable().optional(),
  people: z.string().trim().max(500).nullable().optional(),
  consent: z.enum(CONSENT).optional(),
  credit: z.string().trim().max(200).nullable().optional(),
  license: z.string().trim().max(200).nullable().optional(),
  source: z.string().trim().max(300).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  locked: z.boolean().optional(),
  trashed: z.boolean().optional(),
});
export type AssetPatch = z.infer<typeof AssetPatch>;

/** List filters, as sent by the library page. */
export const AssetQuery = z.object({
  q: z.string().trim().max(200).optional(),
  folder: z.string().max(40).optional(),
  tag: z.string().max(40).optional(),
  consent: z.enum(CONSENT).optional(),
  color: z.enum(Object.keys(SWATCHES) as [Swatch, ...Swatch[]]).optional(),
  view: z.enum(["all", "unused", "brand", "trash", "expiring"]).default("all"),
  collection: z.string().max(40).optional(),
});
export type AssetQuery = z.infer<typeof AssetQuery>;
