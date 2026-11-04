import { z } from "zod";

export const LINKEDIN_ACTIVITY_URL = "https://www.linkedin.com/company/102677155/admin/notifications/all/";
export const LINKEDIN_BOARD_KEY = "symposium2026.linkedin.v1";
export const LINKEDIN_FEEDBACK_PATH = "/events/2026-annual-symposium/feedback";
export const LinkedinKind = z.enum(["mention", "comment", "repost", "reaction", "message"]);
export const LinkedinTopic = z.enum(["symposium", "training_week", "both"]);
export const LinkedinStatus = z.enum(["pending", "replied", "no_reply"]);

export function linkedinSourceUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || !["www.linkedin.com", "linkedin.com"].includes(url.hostname) || url.username || url.password || !/^\/(feed\/update\/|company\/102677155\/admin\/inbox)/.test(url.pathname)) throw new Error("Use a LinkedIn post, comment or BioHubNet inbox link.");
  url.hostname = "www.linkedin.com";
  const comment = url.searchParams.get("dashCommentUrn") ?? url.searchParams.get("commentUrn");
  url.search = "";
  url.hash = "";
  if (comment) url.searchParams.set("dashCommentUrn", comment);
  return url.href;
}

export function linkedinEmbedUrl(value: string): string | null {
  try {
    const url = new URL(linkedinSourceUrl(value));
    if (url.origin !== "https://www.linkedin.com") return null;
    const urn = url.pathname.match(/^\/feed\/update\/(urn:li:(?:activity|share|ugcPost):\d+)\/?$/)?.[1];
    return urn ? `https://www.linkedin.com/embed/feed/update/${urn}` : null;
  } catch { return null; }
}

const SourceUrl = z.string().trim().max(2000).transform((value, ctx) => {
  try { return linkedinSourceUrl(value); }
  catch { ctx.addIssue({ code: "custom", message: "Use a LinkedIn post, comment or BioHubNet inbox link." }); return z.NEVER; }
});
export const LinkedinInput = z.object({
  sourceUrl: SourceUrl, author: z.string().trim().min(1).max(240),
  kind: LinkedinKind, topic: LinkedinTopic,
  sourceText: z.string().trim().min(1).max(16000),
  reply: z.string().trim().max(3000),
  status: LinkedinStatus.default("pending"),
  occurredLabel: z.string().max(100).default(""),
});
export const LinkedinEntry = LinkedinInput.extend({
  id: z.string().min(1).max(2100), observedAt: z.string().datetime(),
  updatedAt: z.string().datetime(), updatedBy: z.string().max(240), notes: z.string().max(2000).default(""),
  testimonial: z.object({ quote: z.string().trim().min(1).max(1200), publishedAt: z.string().datetime(), publishedBy: z.string().max(240) }).nullable().optional(),
});
export const LinkedinBoard = z.object({ entries: z.array(LinkedinEntry).max(2000), checkedAt: z.string().datetime().nullable(), coverage: z.string().max(800) });
export type LinkedinEntry = z.infer<typeof LinkedinEntry>;
export type LinkedinBoard = z.infer<typeof LinkedinBoard>;
export interface LinkedinSnapshot { board: LinkedinBoard; version: string | null }
export const LinkedinAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), entry: LinkedinInput }),
  z.object({ action: z.literal("import"), entries: z.array(LinkedinInput).min(1).max(300), coverage: z.string().trim().min(1).max(800) }),
  z.object({ action: z.literal("edit"), id: z.string().max(2100), reply: z.string().trim().max(3000), status: LinkedinStatus, notes: z.string().max(2000) }),
  z.object({ action: z.literal("testimonial"), id: z.string().max(2100), quote: z.string().trim().max(1200), publish: z.boolean() }),
]);
export type LinkedinAction = z.infer<typeof LinkedinAction>;

export function changeLinkedinBoard(board: LinkedinBoard, action: LinkedinAction, actor: string, at: string): LinkedinBoard {
  const next = structuredClone(board);
  if (action.action === "testimonial") {
    const entry = next.entries.find(e => e.id === action.id);
    if (!entry) throw new Error("This interaction no longer exists. Reload the queue.");
    if (action.publish && !canPublishLinkedinQuote(entry, action.quote)) throw new Error("Public quotes must be verbatim excerpts from a public LinkedIn post or comment.");
    entry.testimonial = action.publish ? { quote: action.quote.trim(), publishedAt: at, publishedBy: actor } : null;
  } else if (action.action === "edit") {
    const entry = next.entries.find(e => e.id === action.id);
    if (!entry) throw new Error("This interaction no longer exists. Reload the queue.");
    Object.assign(entry, { reply: action.reply, status: action.status, notes: action.notes, updatedBy: actor, updatedAt: at });
  } else {
    for (const input of action.action === "add" ? [action.entry] : action.entries) {
      const sourceUrl = linkedinSourceUrl(input.sourceUrl), id = `${input.kind}:${sourceUrl}`;
      const existing = next.entries.find(e => e.id === id);
      if (existing) {
        if (action.action === "add") throw new Error("This interaction is already in the queue.");
        // New scans update the evidence, never a colleague's reply or completion status.
        Object.assign(existing, { sourceText: input.sourceText, occurredLabel: input.occurredLabel, observedAt: at });
      } else next.entries.push({ ...input, sourceUrl, id, observedAt: at, updatedAt: at, updatedBy: actor, notes: "" });
    }
    if (action.action === "import") { next.checkedAt = at; next.coverage = action.coverage; }
  }
  return LinkedinBoard.parse(next);
}

export function canPublishLinkedinQuote(entry: LinkedinEntry, quote: string): boolean {
  const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
  return !["message", "reaction"].includes(entry.kind) && !!linkedinEmbedUrl(entry.sourceUrl)
    && !!normalize(quote) && quote.trim().length <= 1200 && normalize(entry.sourceText).includes(normalize(quote));
}

export function publicLinkedinTestimonials(board: LinkedinBoard) {
  // Explicit allowlist: never serialize the admin board into a public response.
  return board.entries.filter(e => e.testimonial && canPublishLinkedinQuote(e, e.testimonial.quote))
    .map(e => ({ author: e.author, quote: e.testimonial!.quote, sourceUrl: e.sourceUrl, topic: e.topic, publishedAt: e.testimonial!.publishedAt }))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}
export type LinkedinTestimonial = ReturnType<typeof publicLinkedinTestimonials>[number];
