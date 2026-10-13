import { z } from "zod";
import { identityText, matchPlanPeople, type PlanSnapshot } from "./people-plan";
import { PUBLICATION_EVENT, type PublicationState } from "./people-publication";

export const WebsitePeopleSchema = z.object({
  snapshot: z.object({
    schemaVersion: z.literal(1),
    eventId: z.literal(PUBLICATION_EVENT),
    initialized: z.literal(true),
    complete: z.literal(true),
    revision: z.number().int().nonnegative(),
    people: z.array(z.object({ id: z.string().min(1), fullName: z.string().min(1) })).max(2000),
  }),
});
export type WebsitePeople = z.infer<typeof WebsitePeopleSchema>["snapshot"];

function normalizedName(name: string) {
  return identityText(name).replace(/^(?:(?:dr|prof|professor)\s+)+/, "");
}

export function speakerSessionActions(roster: PlanSnapshot, state: PublicationState, website: WebsitePeople) {
  const matches = matchPlanPeople(roster.people, roster.speakers);
  return roster.people.flatMap((person) => {
    const speaker = matches.get(person.id)?.speaker;
    if (person.archived || !speaker?.submittedAt || speaker.eventSlug !== PUBLICATION_EVENT) return [];
    const names = [person.fullName, speaker.fullName].map(normalizedName);
    if (website.people.some((p) => p.id === person.id || names.includes(normalizedName(p.fullName)))) return [];
    const approved = state.approved.find((p) => p.id === person.id);
    const draft = state.drafts.find((p) => p.id === person.id);
    // Never hide an explicit symposium assignment or an existing publication review.
    if (person.participation2026 === "training-week" && !person.session && !draft && !approved) return [];
    return [{ person, speaker, draft, awaitingSync: Boolean(approved && state.initialized && website.revision < approved.approvedRevision) }];
  });
}
