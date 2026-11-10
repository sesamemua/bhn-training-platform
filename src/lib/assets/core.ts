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
export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const;
/** Videos go straight from the browser to storage, so they aren't held to the 4.5 MB request cap. */
export const MAX_VIDEO_BYTES = 500_000_000;
/** Whisper is sent the file itself; past this size, upload captions instead. */
export const MAX_TRANSCRIBE_BYTES = 25_000_000;

/**
 * Where a picture came from. Suggested from its own metadata at upload
 * (IPTC digital source type, Content Credentials, camera/software tags);
 * a person can always correct it.
 */
export const ORIGINS = ["camera", "edited", "ai_edited", "ai_generated", "unknown"] as const;
export type Origin = (typeof ORIGINS)[number];
export const ORIGIN_LABEL: Record<Origin, string> = {
  camera: "Camera original", edited: "Edited", ai_edited: "AI-edited", ai_generated: "AI-generated", unknown: "Origin unknown",
};
/** What a post using this picture should tell its readers, or null. */
export function aiDisclosure(origin: string): string | null {
  if (origin === "ai_generated") return "This picture is AI-generated. Say so in the post.";
  if (origin === "ai_edited") return "This picture was edited with AI. Consider saying so in the post.";
  return null;
}

/** Bits that differ between two 64-bit hex hashes (0 = look identical). */
export function hamming(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < 16; i += 4) {
    let x = (parseInt(a.slice(i, i + 4), 16) ^ parseInt(b.slice(i, i + 4), 16)) >>> 0;
    while (x) { d += x & 1; x >>>= 1; }
  }
  return d;
}
/** Near-duplicates: burst shots, re-exports, the same photo resized. */
export const NEAR_DUPLICATE_BITS = 8;

/** Group assets whose hashes are within NEAR_DUPLICATE_BITS of each other. */
export function duplicateGroups<T extends { id: string; phash: string | null }>(items: T[]): T[][] {
  const withHash = items.filter((i) => i.phash);
  const seen = new Set<string>();
  const groups: T[][] = [];
  for (const a of withHash) {
    if (seen.has(a.id)) continue;
    const group = withHash.filter((b) => !seen.has(b.id) && hamming(a.phash!, b.phash!) <= NEAR_DUPLICATE_BITS);
    if (group.length > 1) { group.forEach((g) => seen.add(g.id)); groups.push(group); }
  }
  return groups;
}

/** Guess origin from what the file says about itself. */
export function inferOrigin(p: { digitalSourceType?: string | null; software?: string | null; make?: string | null; generator?: string | null }): Origin {
  const dst = (p.digitalSourceType ?? "").toLowerCase();
  if (dst.includes("compositewithtrainedalgorithmicmedia") || dst.includes("algorithmicallyenhanced")) return "ai_edited";
  if (dst.includes("trainedalgorithmicmedia") || p.generator) return "ai_generated";
  if (p.software && /photoshop|lightroom|snapseed|gimp|affinity|canva|capture one|vsco|picsart/i.test(p.software)) return "edited";
  if (p.make) return "camera";
  return "unknown";
}
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
  origin: z.enum(ORIGINS).optional(),
  transcript: z.string().max(100_000).nullable().optional(),
});
export type AssetPatch = z.infer<typeof AssetPatch>;

/** List filters, as sent by the library page. */
export const AssetQuery = z.object({
  q: z.string().trim().max(200).optional(),
  folder: z.string().max(40).optional(),
  tag: z.string().max(40).optional(),
  consent: z.enum(CONSENT).optional(),
  color: z.enum(Object.keys(SWATCHES) as [Swatch, ...Swatch[]]).optional(),
  view: z.enum(["all", "unused", "brand", "trash", "expiring", "duplicates", "videos", "top"]).default("all"),
  collection: z.string().max(40).optional(),
  origin: z.enum(ORIGINS).optional(),
});
/** The filters a smart collection saves (no view, no collection). */
export const SmartQuery = AssetQuery.pick({ q: true, folder: true, tag: true, consent: true, color: true, origin: true });
export type AssetQuery = z.infer<typeof AssetQuery>;

/** Caption files → plain words: drop cue numbers, timings and tags. */
export function captionText(raw: string): string {
  return raw.replace(/^WEBVTT.*$/m, "").split(/\r?\n/)
    .filter((l) => l.trim() && !/^\d+$/.test(l.trim()) && !/-->/.test(l) && !/^(NOTE|STYLE|REGION)\b/.test(l))
    .map((l) => l.replace(/<[^>]+>/g, "").trim()).join(" ").replace(/\s+/g, " ").trim();
}

/** Pre-publish checks for a drafted LinkedIn post and its picture. */
export function postChecks(body: string, asset: (RightsFacts & { origin: string }) | null): { ok: boolean; label: string }[] {
  const text = body.trim();
  const tags = text.match(/#[\p{L}\d_]+/gu) ?? [];
  const checks = [
    { ok: text.length > 0 && text.length <= 3000, label: `Length ${text.length.toLocaleString()} / 3,000 characters` },
    { ok: tags.length <= 5, label: tags.length ? `${tags.length} hashtag${tags.length === 1 ? "" : "s"} (5 or fewer reads best)` : "No hashtags" },
    { ok: !/\b(lorem|TODO|TBD|\[insert)/i.test(text), label: "No placeholders left in the text" },
  ];
  if (asset) {
    const block = publishBlock(asset);
    checks.push({ ok: !block, label: block ?? "Picture rights and consent are clear" });
    const disclose = aiDisclosure(asset.origin);
    if (disclose) checks.push({ ok: /\bAI\b|artificial intelligence|generated/i.test(text), label: disclose });
  } else checks.push({ ok: false, label: "Pick a picture for the post" });
  return checks;
}
