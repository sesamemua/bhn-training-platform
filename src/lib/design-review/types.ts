/**
 * Design review: artworks (a PDF's pages, or an image, kept as images)
 * that the team comments on by pinning a note anywhere on the picture,
 * with who has seen and OK'd each one and the approver's decision.
 *
 * Pure: shapes, limits and the status roll-up. No Prisma, no React.
 */
import { z } from "zod";

/** Every stored page lives under this R2 prefix; nothing else is accepted as a page. */
export const KEY_PREFIX = "design-review/";
export const MAX_PAGE_BYTES = 4 * 1024 * 1024; // under Vercel's request-body limit
export const MAX_PAGES = 40;
export const PAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export const PageSchema = z.object({
  key: z.string().startsWith(KEY_PREFIX).max(200),
  url: z.string().url().max(500),
  w: z.number().int().min(1).max(20000),
  h: z.number().int().min(1).max(20000),
});
export type Page = z.infer<typeof PageSchema>;
export const PagesSchema = z.array(PageSchema).min(1).max(MAX_PAGES);
export const pagesOf = (raw: unknown): Page[] => { const r = z.array(PageSchema).safeParse(raw); return r.success ? r.data : []; };

export const ProjectInput = z.object({
  name: z.string().trim().min(1, "Give the project a name.").max(120),
  description: z.string().trim().max(600).default(""),
  approverId: z.string().max(40).nullable().default(null),
});
export const ArtworkInput = z.object({
  title: z.string().trim().min(1, "Give the artwork a title.").max(160),
  description: z.string().trim().max(1000).default(""),
});
export const PinInput = z.object({
  page: z.number().int().min(0).max(MAX_PAGES - 1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  body: z.string().trim().min(1, "Write the comment.").max(2000),
});

export const APPROVALS = ["pending", "approved", "changes"] as const;
export type Approval = (typeof APPROVALS)[number];
export const APPROVAL_LABEL: Record<Approval, string> = { pending: "Waiting for approval", approved: "Approved", changes: "Changes requested" };
export const isApproval = (v: unknown): v is Approval => (APPROVALS as readonly string[]).includes(v as string);

export type Seen = "none" | "viewed" | "ok";
export interface Reviewer { id: string; name: string }
/** Each reviewer's place on an artwork: not opened it, seen it, or said it is OK. */
export function reviewerStates(reviewers: Reviewer[], reviews: { userId: string; viewedAt: unknown; okAt: unknown; requestedAt?: unknown }[]): (Reviewer & { state: Seen; asked: boolean })[] {
  const by = new Map(reviews.map((r) => [r.userId, r]));
  return reviewers.map((p) => {
    const r = by.get(p.id);
    return { ...p, state: r?.okAt ? "ok" : r?.viewedAt ? "viewed" : "none", asked: !!r?.requestedAt };
  });
}

export interface BriefPin { id: string; parentId: string | null; page: number; x: number; y: number; authorName: string; body: string; status: string; createdAt: string }
const pct = (n: number) => `${Math.round(n * 100)}%`;
/**
 * The round's open comments as text to hand to whoever makes the changes.
 * Numbered as on the artwork (by when the thread started), each with where
 * it sits — a share of the page from its left and top edges.
 */
export function designBrief(a: { project: string; title: string; round: number; pages: number; pins: BriefPin[] }): string {
  const byTime = (x: BriefPin, y: BriefPin) => x.createdAt.localeCompare(y.createdAt);
  const threads = a.pins.filter((p) => !p.parentId).sort(byTime);
  const open = threads.filter((t) => t.status === "open");
  const out = [`${a.project} — ${a.title}`, `Design feedback, round ${a.round}: ${open.length} open comment${open.length === 1 ? "" : "s"}`, ""];
  if (!open.length) out.push("No open comments.");
  for (const t of open) {
    const where = `${a.pages > 1 ? `page ${t.page + 1}, ` : ""}${pct(t.x)} from the left, ${pct(t.y)} from the top`;
    out.push(`${threads.indexOf(t) + 1}. (${where}) ${t.authorName}: ${t.body}`);
    for (const r of a.pins.filter((p) => p.parentId === t.id).sort(byTime)) out.push(`   ↳ ${r.authorName}: ${r.body}`);
    out.push("");
  }
  return out.join("\n").trim();
}
export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
