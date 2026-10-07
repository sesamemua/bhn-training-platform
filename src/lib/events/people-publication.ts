import { z } from "zod";

export const PUBLICATION_EVENT = "2026-annual-symposium";
export const WEBSITE_SESSIONS = {
  keynote: "Keynote",
  "panel-1": "Panel 1",
  "panel-2": "Panel 2",
  "panel-3": "Panel 3",
  networking: "Structured Networking with Industry Professionals",
  discussion: "Interactive Discussion Session",
} as const;
export const WebsiteSession = z.enum(["keynote", "panel-1", "panel-2", "panel-3", "networking", "discussion"]);
export const HttpsUrl = z.string().max(2048).url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password && !url.port;
}, "Use an HTTPS URL without credentials or a custom port.");
export const PublicProfileInput = z.object({
  fullName: z.string().trim().min(2).max(120),
  title: z.string().trim().max(160),
  organization: z.string().trim().max(160),
  bio: z.string().trim().max(10000),
  photoUrl: HttpsUrl.nullable(),
  linkedinUrl: HttpsUrl.refine((value) => /(^|\.)linkedin\.com$/.test(new URL(value).hostname), "Use a LinkedIn URL.").nullable(),
  links: z.array(z.object({ label: z.string().trim().min(1).max(120), url: HttpsUrl }).strict()).max(12),
  placements: z.array(z.object({ sessionId: WebsiteSession, order: z.number().int().min(0).max(999) }).strict()).min(1).max(6)
    .refine((items) => new Set(items.map((p) => p.sessionId)).size === items.length, "Choose each session once."),
}).strict();
export type PublicProfileInput = z.infer<typeof PublicProfileInput>;
const PersonId = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
export const PublicationDraft = z.object({ id: PersonId, profile: PublicProfileInput });
export const ApprovedPerson = PublicationDraft.extend({ approvedRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) });
export const PublicationStateSchema = z.object({
  initialized: z.boolean(),
  revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  updatedAt: z.string().datetime().nullable(),
  drafts: z.array(PublicationDraft).max(500),
  approved: z.array(ApprovedPerson).max(500),
}).refine((state) => new Set(state.drafts.map((p) => p.id)).size === state.drafts.length
  && new Set(state.approved.map((p) => p.id)).size === state.approved.length
  && state.approved.every((p) => p.approvedRevision <= state.revision));
export type PublicationState = z.infer<typeof PublicationStateSchema>;
export const PlannerPublicationChanges = z.array(z.object({ id: PersonId, profile: PublicProfileInput.nullable() }).strict()).max(500)
  .refine((items) => new Set(items.map((p) => p.id)).size === items.length, "Each person may appear only once.");
export type PlannerPublicationChanges = z.infer<typeof PlannerPublicationChanges>;
export const PublicationAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), id: PersonId, profile: PublicProfileInput }).strict(),
  z.object({ action: z.literal("approve"), id: PersonId, draftHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z.object({ action: z.literal("unpublish"), id: PersonId }).strict(),
  z.object({ action: z.literal("initialize"), confirm: z.literal(true) }).strict(),
  z.object({ action: z.literal("publish-plan"), confirm: z.literal(true), rosterHash: z.string().regex(/^[a-f0-9]{64}$/), changes: PlannerPublicationChanges }).strict(),
]);
export type PublicationAction = z.infer<typeof PublicationAction>;
export const EMPTY_PUBLICATION: PublicationState = { initialized: false, revision: 0, updatedAt: null, drafts: [], approved: [] };

/** Explicit whitelist: the public feed never serializes an admin/roster record. */
export function publicPeopleFeed(state: PublicationState) {
  return {
    schemaVersion: 1 as const, eventId: PUBLICATION_EVENT,
    initialized: state.initialized, complete: state.initialized,
    revision: state.revision, updatedAt: state.updatedAt,
    people: state.initialized ? state.approved.map(({ id, profile, approvedRevision }) => ({
      id, approvedRevision, fullName: profile.fullName, title: profile.title,
      organization: profile.organization, bio: profile.bio, photoUrl: profile.photoUrl,
      linkedinUrl: profile.linkedinUrl,
      links: profile.links.map(({ label, url }) => ({ label, url })),
      placements: profile.placements.map(({ sessionId, order }) => ({ id: `${id}:${sessionId}`, sessionId, order })),
    })) : [],
  };
}
