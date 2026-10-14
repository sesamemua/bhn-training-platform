import { prisma } from "@/lib/prisma";
import { buildPeopleRoster } from "./people-roster";
import { matchPlanPeople, type PlanSnapshot } from "./people-plan";
import { loadPeoplePlan } from "./people-plan-store";
import { PUBLICATION_EVENT, PublicProfileInput, PublicationStateSchema, type PublicationState } from "./people-publication";
import { loadPublication, PUBLICATION_KEY, PublicationConflict } from "./people-publication-store";
import { freezePublicationPhoto } from "./publication-photo";

export function submittedProfileUpdates(state: PublicationState, roster: PlanSnapshot) {
  if (!state.initialized) return [];
  const people = roster.people.filter((person) => !person.archived && state.approved.some((entry) => entry.id === person.id));
  const seen = new Set<string>();
  const changes: { id: string; profile: PublicProfileInput; sourceSubmissionId: string }[] = [];
  const submissions = roster.speakers.filter((speaker) => speaker.eventSlug === PUBLICATION_EVENT && speaker.submittedAt && speaker.bio && speaker.photoUrl)
    .sort((a, b) => b.submittedAt!.localeCompare(a.submittedAt!));
  for (const submission of submissions) {
    const matches = matchPlanPeople(buildPeopleRoster(people, [], [submission]), [submission]);
    const owners = people.filter((person) => matches.get(person.id)?.speaker?.id === submission.id);
    if (owners.length !== 1 || seen.has(owners[0].id)) continue;
    const approved = state.approved.find((entry) => entry.id === owners[0].id)!;
    seen.add(approved.id);
    if (approved.sourceSubmissionId === submission.id) continue;
    changes.push({
      id: approved.id, sourceSubmissionId: submission.id,
      profile: PublicProfileInput.parse({
        ...approved.profile,
        fullName: submission.fullName, title: submission.title ?? approved.profile.title,
        organization: submission.organization ?? approved.profile.organization,
        bio: submission.bio, photoUrl: submission.photoUrl,
      }),
    });
  }
  return changes;
}

/** Existing website placements are retained; unknown or ambiguous people stay in intake. */
export async function syncPublishedSpeakerSubmissions() {
  for (let attempt = 0; attempt < 3; attempt++) {
    const publication = await loadPublication();
    if (!publication.state.initialized) return publication;
    const { snapshot } = await loadPeoplePlan();
    const changes = submittedProfileUpdates(publication.state, snapshot);
    if (!changes.length) return publication;
    for (let index = 0; index < changes.length; index += 4) {
      await Promise.all(changes.slice(index, index + 4).map(async (entry) => {
        entry.profile.photoUrl = await freezePublicationPhoto(entry.profile.photoUrl);
      }));
    }
    const now = new Date(Math.max(Date.now(), Date.parse(publication.version!) + 1));
    const next = structuredClone(publication.state);
    next.revision++;
    next.updatedAt = now.toISOString();
    for (const change of changes) {
      const approved = next.approved.find((entry) => entry.id === change.id)!;
      Object.assign(approved, change, { approvedRevision: next.revision });
      const draft = next.drafts.find((entry) => entry.id === change.id);
      if (draft) Object.assign(draft.profile, {
        fullName: change.profile.fullName, title: change.profile.title, organization: change.profile.organization,
        bio: change.profile.bio, photoUrl: change.profile.photoUrl,
      });
    }
    const state = PublicationStateSchema.parse(next);
    const value = JSON.stringify(state);
    const saved = await prisma.platformSetting.updateMany({
      where: { key: PUBLICATION_KEY, value: publication.raw!, updatedAt: new Date(publication.version!) },
      data: { value, updatedAt: now },
    });
    if (saved.count) return { state, raw: value, version: now.toISOString() };
  }
  throw new PublicationConflict("Website publishing changed while a speaker submission was syncing.");
}
