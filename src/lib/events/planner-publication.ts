import { matchPlanPeople, type PlanSnapshot } from "./people-plan";
import { PublicProfileInput, type PlannerPublicationChanges, type PublicationState } from "./people-publication";

const isPlannerSession = (id: string) => id === "networking" || id === "discussion";

/** Only the two planner sessions are authoritative here; keynote/panels stay intact. */
export function plannerPublicationChanges(state: PublicationState, roster: PlanSnapshot): PlannerPublicationChanges {
  const changes: PlannerPublicationChanges = [];
  const matches = matchPlanPeople(roster.people, roster.speakers);
  const assigned = new Set<string>();
  const order = { networking: 0, discussion: 0 };
  for (const person of roster.people) {
    if (person.archived || !person.session) continue;
    assigned.add(person.id);
    const approved = state.approved.find((p) => p.id === person.id)?.profile;
    const draft = state.drafts.find((p) => p.id === person.id)?.profile;
    const submission = matches.get(person.id)?.speaker;
    const base = draft ?? approved;
    const profile = PublicProfileInput.parse({
      fullName: person.fullName, title: person.title, organization: person.organization,
      // The planner's freeform biography field can contain private notes.
      bio: base?.bio ?? submission?.bio ?? (person.source === "2025" ? person.bio : ""),
      photoUrl: base?.photoUrl ?? submission?.photoUrl ?? person.photoUrl ?? null,
      linkedinUrl: base?.linkedinUrl ?? null, links: base?.links ?? [],
      placements: [
        ...(approved?.placements ?? []).filter((p) => !isPlannerSession(p.sessionId)),
        { sessionId: person.session, order: order[person.session]++ },
      ],
    });
    if (!approved || JSON.stringify(profile) !== JSON.stringify(approved)) changes.push({ id: person.id, profile });
  }
  for (const approved of state.approved) {
    if (assigned.has(approved.id) || !approved.profile.placements.some((p) => isPlannerSession(p.sessionId))) continue;
    const placements = approved.profile.placements.filter((p) => !isPlannerSession(p.sessionId));
    changes.push({ id: approved.id, profile: placements.length ? { ...approved.profile, placements } : null });
  }
  return changes;
}
