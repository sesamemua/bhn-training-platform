import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { EVENT_SLUG } from "@/lib/allocation/symposium-2026";
import { PEOPLE_2025 } from "./people-2025";
import { PEOPLE_2026 } from "./people-2026";
import { buildPeopleRoster } from "./people-roster";
import { BoardSchema, PersonInput, SessionSchema, duplicatePeople, matchPlanPeople, type PlanPerson, type PlanSnapshot, type Submission } from "./people-plan";

export const PEOPLE_PLAN_KEY = "symposium2026.peoplePlan.v1";
export const PlanAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), people: z.array(PersonInput.extend({ session: SessionSchema })).min(1).max(100) }),
  z.object({ action: z.literal("edit"), id: z.string().max(100), person: PersonInput }),
  z.object({ action: z.literal("assign"), id: z.string().max(100), session: SessionSchema.nullable() }),
  z.object({ action: z.literal("archive"), id: z.string().max(100), archived: z.boolean() }),
  z.object({ action: z.literal("link"), id: z.string().max(100), speakerId: z.string().max(100).nullable() }),
]);
export type PlanAction = z.infer<typeof PlanAction>;

export async function loadPeoplePlan() {
  const [saved, event, insights] = await Promise.all([
    prisma.platformSetting.findUnique({ where: { key: PEOPLE_PLAN_KEY } }),
    prisma.bhnEvent.findUnique({ where: { slug: EVENT_SLUG }, select: { speakers: { orderBy: { createdAt: "desc" }, select: {
      id: true, fullName: true, organization: true, title: true, bio: true, contactEmail: true,
      photoUrl: true, sessionTitle: true, submittedAt: true,
    } } } }),
    prisma.bhnEvent.findUnique({ where: { slug: "2026-industry-insights" }, select: { speakers: { orderBy: { createdAt: "desc" }, select: {
      id: true, fullName: true, organization: true, title: true, bio: true, contactEmail: true,
      photoUrl: true, sessionTitle: true, submittedAt: true,
    } } } }),
  ]);
  if (!event) throw new Error("Symposium event not found.");
  // Fail visibly on corrupt stored data instead of silently erasing colleagues' work.
  const stored = saved ? BoardSchema.parse(JSON.parse(saved.value)).people : structuredClone(PEOPLE_2025);
  const speakers: Submission[] = [
    ...event.speakers.map((s) => ({ ...s, eventSlug: EVENT_SLUG, submittedAt: s.submittedAt?.toISOString() ?? null })),
    ...(insights?.speakers ?? []).map((s) => ({ ...s, eventSlug: "2026-industry-insights", submittedAt: s.submittedAt?.toISOString() ?? null })),
  ];
  const people = buildPeopleRoster(stored, [...PEOPLE_2025, ...PEOPLE_2026], speakers);
  return { snapshot: { people, speakers, version: saved?.updatedAt.toISOString() ?? null } satisfies PlanSnapshot, raw: saved?.value ?? null };
}

export function changePeoplePlan(snapshot: PlanSnapshot, action: PlanAction): { people: PlanPerson[]; added: number; skipped: number } {
  const people = structuredClone(snapshot.people);
  let added = 0, skipped = 0;
  if (action.action === "add") {
    for (const input of action.people) {
      if (people.some((p) => duplicatePeople(p, input))) { skipped++; continue; }
      people.push({ ...input, id: randomUUID(), source: "paste", linkedSpeakerId: null, ignoredSpeakerIds: [], archived: false });
      added++;
    }
  } else {
    const person = people.find((p) => p.id === action.id);
    if (!person) throw new Error("This profile no longer exists. Refresh the board.");
    if (action.action === "edit") {
      if (people.some((p) => p.id !== person.id && duplicatePeople(p, action.person))) throw new Error("A profile with this identity already exists.");
      Object.assign(person, action.person);
    }
    if (action.action === "assign") person.session = action.session;
    if (action.action === "archive") person.archived = action.archived;
    if (action.action === "link") {
      if (action.speakerId) {
        if (!snapshot.speakers.some((s) => s.id === action.speakerId && s.submittedAt)) throw new Error("No submitted profile for this event.");
        const matches = matchPlanPeople(people, snapshot.speakers);
        if (people.some((p) => !p.archived && p.id !== person.id && (p.linkedSpeakerId === action.speakerId || matches.get(p.id)?.speaker?.id === action.speakerId))) throw new Error("This submission is already matched to another profile.");
        person.linkedSpeakerId = action.speakerId;
        person.ignoredSpeakerIds = person.ignoredSpeakerIds.filter((id) => id !== action.speakerId);
      } else {
        const current = matchPlanPeople(people, snapshot.speakers).get(person.id)?.speaker;
        if (current) person.ignoredSpeakerIds = [...new Set([...person.ignoredSpeakerIds, current.id])];
        person.linkedSpeakerId = null;
      }
    }
  }
  BoardSchema.parse({ people });
  return { people, added, skipped };
}

/** Compare-and-swap prevents two colleagues from overwriting each other's edits. */
export async function savePeoplePlan(version: string | null, action: PlanAction) {
  const current = await loadPeoplePlan();
  if (version !== current.snapshot.version) return { conflict: true as const, snapshot: current.snapshot };
  const change = changePeoplePlan(current.snapshot, action);
  const value = JSON.stringify({ people: change.people });
  const now = new Date(Math.max(Date.now(), Date.parse(version ?? "") + 1 || 0));
  if (current.raw === null) {
    try { await prisma.platformSetting.create({ data: { key: PEOPLE_PLAN_KEY, value, updatedAt: now } }); }
    catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e;
      return { conflict: true as const, snapshot: (await loadPeoplePlan()).snapshot };
    }
  } else {
    const saved = await prisma.platformSetting.updateMany({ where: { key: PEOPLE_PLAN_KEY, value: current.raw, updatedAt: new Date(version!) }, data: { value, updatedAt: now } });
    if (!saved.count) return { conflict: true as const, snapshot: (await loadPeoplePlan()).snapshot };
  }
  return { conflict: false as const, snapshot: { ...current.snapshot, people: change.people, version: now.toISOString() }, added: change.added, skipped: change.skipped };
}
