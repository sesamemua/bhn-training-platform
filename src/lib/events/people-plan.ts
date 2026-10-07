import { z } from "zod";

export const PLAN_SESSIONS = {
  networking: "Structured Networking with Industry Professionals",
  discussion: "Interactive Discussion Session",
} as const;
export const SessionSchema = z.enum(["networking", "discussion"]);
export type PlanSession = z.infer<typeof SessionSchema>;
export const PersonInput = z.object({
  fullName: z.string().trim().min(2).max(120),
  organization: z.string().trim().max(160).default(""),
  title: z.string().trim().max(160).default(""),
  bio: z.string().trim().max(10000).default(""),
  email: z.union([z.literal(""), z.string().trim().email().max(254)]).default(""),
});
export type PersonInput = z.infer<typeof PersonInput>;
export const PlanPersonSchema = PersonInput.extend({
  id: z.string().max(100),
  session: SessionSchema.nullable(),
  source: z.enum(["paste", "2025"]),
  sourceUrl: z.string().url().optional(),
  photoUrl: z.string().url().optional(),
  linkedSpeakerId: z.string().max(100).nullable().default(null),
  ignoredSpeakerIds: z.array(z.string().max(100)).max(500).default([]),
  archived: z.boolean().default(false),
});
export type PlanPerson = z.infer<typeof PlanPersonSchema>;
export const BoardSchema = z.object({ people: z.array(PlanPersonSchema).max(500) });
export type Submission = {
  id: string; fullName: string; organization: string | null; title: string | null;
  bio: string | null; contactEmail: string | null; photoUrl: string | null;
  sessionTitle: string | null; submittedAt: string | null;
};
export type Match = { speaker: Submission | null; candidates: Submission[]; kind: "manual" | "email" | "name-company" | "review" | "none" };
export type PlanSnapshot = { people: PlanPerson[]; speakers: Submission[]; version: string | null };

export const identityText = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const emailText = (s: string) => s.trim().toLowerCase();
const nameText = (s: string) => identityText(s).replace(/^(dr|prof|professor) /, "");

/** Conservative, one-to-one links. Ambiguity never silently chooses a person. */
export function matchPlanPeople(people: PlanPerson[], speakers: Submission[]): Map<string, Match> {
  const matches = new Map<string, Match>();
  const claimed = new Set(people.filter((p) => !p.archived && p.linkedSpeakerId).map((p) => p.linkedSpeakerId!));
  for (const p of people) {
    const manual = speakers.find((s) => s.id === p.linkedSpeakerId);
    if (manual && !p.archived) { matches.set(p.id, { speaker: manual, candidates: [], kind: "manual" }); continue; }
    const available = speakers.filter((s) => s.submittedAt && !claimed.has(s.id) && !p.ignoredSpeakerIds.includes(s.id));
    const emails = p.email ? available.filter((s) => emailText(s.contactEmail ?? "") === emailText(p.email)) : [];
    const names = available.filter((s) => nameText(s.fullName) === nameText(p.fullName));
    const exact = names.filter((s) => p.organization && identityText(s.organization ?? "") === identityText(p.organization)
      && !(p.email && s.contactEmail && emailText(p.email) !== emailText(s.contactEmail)));
    const candidates = emails.length ? emails : exact.length ? exact : names;
    const kind = emails.length === 1 ? "email" : exact.length === 1 && emails.length === 0 ? "name-company" : candidates.length ? "review" : "none";
    matches.set(p.id, { speaker: !p.archived && candidates.length === 1 && kind !== "review" ? candidates[0] : null, candidates, kind });
  }
  const owners = new Map<string, string[]>();
  for (const [id, match] of matches) if (match.speaker) owners.set(match.speaker.id, [...(owners.get(match.speaker.id) ?? []), id]);
  for (const ids of owners.values()) if (ids.length > 1) for (const id of ids) {
    const match = matches.get(id)!;
    matches.set(id, { speaker: null, candidates: [match.speaker!], kind: "review" });
  }
  return matches;
}

export function duplicatePeople(a: PersonInput, b: PersonInput): boolean {
  if (a.email && b.email) return emailText(a.email) === emailText(b.email);
  return nameText(a.fullName) === nameText(b.fullName)
    && identityText(a.organization) === identityText(b.organization);
}
