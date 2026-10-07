import { duplicatePeople, identityText, type PlanPerson, type Submission } from "./people-plan";

// Only known organization aliases; a name alone never establishes identity.
const aliases: Record<string, string> = {
  "canadian alliance for skills and training in life sciences castl": "castl",
  "canadian alliance for skills and training in life sciences": "castl",
  "health emergency readiness canada herc": "herc",
  "health emergency readiness canada innovation science and economic development canada": "herc",
  "health emergency readiness canada": "herc",
  "bough biosciences": "bough bio",
};
function comparable(p: PlanPerson) {
  const raw = identityText(p.organization);
  const company = aliases[raw] ?? raw.replace(/ (inc|incorporated|canada)$/, "");
  return { ...p, organization: aliases[company] ?? company };
}

/** Reconcile live sources without overwriting edits, assignments or archived records. */
export function buildPeopleRoster(saved: PlanPerson[], seeds: PlanPerson[], speakers: Submission[]): PlanPerson[] {
  const people = structuredClone(saved);
  const inputs: PlanPerson[] = [
    ...speakers.map((s): PlanPerson => ({
      id: `speaker-${s.id}`, fullName: s.fullName, organization: s.organization ?? "", title: s.title ?? "",
      bio: s.bio ?? "", email: s.contactEmail ?? "", photoUrl: s.photoUrl ?? undefined,
      source: "submission", session: null, linkedSpeakerId: null, speakerIds: [s.id],
      eventTags: s.eventSlug ? [s.eventSlug] : [], ignoredSpeakerIds: [], archived: false,
    })),
    ...seeds,
  ];
  for (const input of inputs) {
    const speakerId = input.speakerIds?.[0];
    const owned = people.filter((p) => p.id === input.id || (speakerId && (p.speakerIds?.includes(speakerId) || p.linkedSpeakerId === speakerId)));
    const candidates = owned.length ? owned : people.filter((p) => duplicatePeople(comparable(p), comparable(input)));
    // Leave uncertain identities separate. A colleague can resolve them explicitly.
    if (candidates.length !== 1) { if (!people.some((p) => p.id === input.id)) people.push(structuredClone(input)); continue; }
    const person = candidates[0];
    person.eventTags = [...new Set([...(person.eventTags ?? []), ...(input.eventTags ?? [])])];
    person.speakerIds = [...new Set([...(person.speakerIds ?? []), ...(input.speakerIds ?? [])])];
    if (!person.sourceUrl && input.sourceUrl) person.sourceUrl = input.sourceUrl;
  }
  return people;
}
