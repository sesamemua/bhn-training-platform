import { HttpsUrl, type PublicProfileInput } from "./people-publication";
import { identityText, matchPlanPeople, type PlanPerson, type PlanSnapshot } from "./people-plan";

type ReviewProfile = {
  fullName: string; title: string | null; organization: string | null; bio: string | null; photoUrl: string | null;
  linkedinUrl?: string | null; links?: PublicProfileInput["links"]; placements?: PublicProfileInput["placements"];
};

/** Review hints only: never rewrite names, affiliations, submissions or approvals. */
export function profileReviewIssues(profile: ReviewProfile, context: { person?: PlanPerson; roster?: PlanSnapshot } = {}): string[] {
  const issues: string[] = [];
  for (const [label, value] of [["Name", profile.fullName], ["Title / role", profile.title], ["Organization", profile.organization], ["Biography", profile.bio], ["Headshot", profile.photoUrl]]) {
    if (!value?.trim()) issues.push(`${label} is missing.`);
  }
  const organization = identityText(profile.organization ?? "");
  if (organization && !(profile.links ?? []).some(({ label, url }) => {
    const name = identityText(label);
    return name && ` ${organization} `.includes(` ${name} `) && HttpsUrl.safeParse(url).success;
  })) issues.push("Organization has no matching public link. Add a verified organization link when reviewing this profile.");
  const text = [profile.fullName, profile.title, profile.organization, profile.bio].filter(Boolean).join("\n");
  if (/\bofficert\b/i.test(text)) issues.push('Possible typo: "Officert". Verify whether "Officer" was intended.');
  if (/\b([a-z]{2,})\s+\1\b/i.test(text)) issues.push("Repeated word found; review the wording.");
  if (/\b(lorem ipsum|insert bio|placeholder|tbd)\b|\?{3,}/i.test(text)) issues.push("Possible placeholder text remains.");
  if (profile.fullName.length > 3 && profile.fullName === profile.fullName.toUpperCase() && /\p{L}/u.test(profile.fullName)) issues.push("Name is all capitals; verify preferred capitalization.");
  for (const [label, url] of [["Headshot", profile.photoUrl], ["LinkedIn", profile.linkedinUrl], ...(profile.links ?? []).map((l) => [l.label || "Reference", l.url])]) {
    if (url && !HttpsUrl.safeParse(url).success) issues.push(`${label} link is invalid. Use a public HTTPS URL.`);
  }
  if (profile.linkedinUrl && HttpsUrl.safeParse(profile.linkedinUrl).success && !/(^|\.)linkedin\.com$/.test(new URL(profile.linkedinUrl).hostname)) issues.push("LinkedIn link does not point to linkedin.com.");
  const sessions = profile.placements?.map((p) => p.sessionId) ?? [];
  if (sessions.includes("networking") && sessions.includes("discussion")) issues.push("Conflicting placements: networking and discussion are concurrent sessions.");
  const { person, roster } = context;
  if (person && roster) {
    const duplicates = roster.people.filter((p) => !p.archived && p.id !== person.id && identityText(p.fullName) === identityText(profile.fullName));
    if (duplicates.length) issues.push("Another roster profile has this name. Verify identity before linking or publishing.");
    const submissions = roster.speakers.filter((s) => s.submittedAt && identityText(s.fullName) === identityText(profile.fullName));
    if (submissions.length > 1) issues.push("Multiple submissions have this name. Verify which submission is current.");
    const submitted = matchPlanPeople(roster.people, roster.speakers).get(person.id)?.speaker;
    for (const [label, value, source] of [["Name", profile.fullName, submitted?.fullName], ["Title / role", profile.title, submitted?.title], ["Organization", profile.organization, submitted?.organization]]) {
      if (source && value && identityText(value) !== identityText(source)) issues.push(`${label} differs from the matched submission. Confirm the intended public wording.`);
    }
    if (person.session && sessions.some((id) => (id === "networking" || id === "discussion") && id !== person.session)) issues.push("Public session differs from the people planner assignment. Confirm the correct session.");
  }
  return issues;
}
