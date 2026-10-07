import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { EMPTY_PUBLICATION, PublicationStateSchema, type PublicationState, type PublicationAction, type PublicProfileInput } from "./people-publication";

export const PUBLICATION_KEY = "symposium2026.peoplePublication.v1";
export class PublicationConflict extends Error {}
export const profileHash = (profile: PublicProfileInput) => createHash("sha256").update(JSON.stringify(profile)).digest("hex");

export async function loadPublication() {
  const row = await prisma.platformSetting.findUnique({ where: { key: PUBLICATION_KEY } });
  const state = row ? PublicationStateSchema.parse(JSON.parse(row.value)) : structuredClone(EMPTY_PUBLICATION);
  return { state, raw: row?.value ?? null, version: row?.updatedAt.toISOString() ?? null };
}

export function applyPublication(state: PublicationState, action: PublicationAction, now: string): PublicationState {
  const next = structuredClone(state);
  if (action.action === "save") {
    const entry = { id: action.id, profile: action.profile };
    const index = next.drafts.findIndex((p) => p.id === action.id);
    if (index < 0) next.drafts.push(entry); else next.drafts[index] = entry;
  } else {
    if (next.revision >= Number.MAX_SAFE_INTEGER) throw new Error("Publication revision limit reached.");
    next.revision++;
    next.updatedAt = now;
    if (action.action === "publish-plan") {
      if (!action.changes.length) throw new Error("No planner changes to publish.");
      for (const change of action.changes) {
        next.approved = next.approved.filter((p) => p.id !== change.id);
        if (change.profile) {
          next.approved.push({ ...structuredClone(change), profile: change.profile, approvedRevision: next.revision });
          next.drafts = next.drafts.filter((p) => p.id !== change.id);
          next.drafts.push({ id: change.id, profile: structuredClone(change.profile) });
        }
      }
    } else if (action.action === "approve") {
      const draft = next.drafts.find((p) => p.id === action.id);
      if (!draft || profileHash(draft.profile) !== action.draftHash) throw new PublicationConflict("The preview changed. Review the latest saved draft.");
      const approved = { ...structuredClone(draft), approvedRevision: next.revision };
      const index = next.approved.findIndex((p) => p.id === action.id);
      if (index < 0) next.approved.push(approved); else next.approved[index] = approved;
    } else if (action.action === "unpublish") {
      if (!next.approved.some((p) => p.id === action.id)) throw new Error("This profile is not published or approved.");
      next.approved = next.approved.filter((p) => p.id !== action.id);
    } else {
      if (next.initialized) throw new Error("Website feed is already activated.");
      if (!next.approved.length) throw new Error("Approve the initial website list before activating.");
      next.initialized = true;
    }
  }
  return PublicationStateSchema.parse(next);
}

/** The snapshot and audit entry commit together; stale editors cannot overwrite approval. */
export async function savePublication(version: string | null, action: PublicationAction, actorId: string) {
  const current = await loadPublication();
  if (version !== current.version) throw new PublicationConflict("A colleague changed website publishing. Reload and review before continuing.");
  const now = new Date(Math.max(Date.now(), Date.parse(version ?? "") + 1 || 0));
  const next = applyPublication(current.state, action, now.toISOString());
  const value = JSON.stringify(next);
  try {
    await prisma.$transaction(async (tx) => {
      if (current.raw === null) await tx.platformSetting.create({ data: { key: PUBLICATION_KEY, value, updatedAt: now } });
      else {
        const result = await tx.platformSetting.updateMany({ where: { key: PUBLICATION_KEY, value: current.raw, updatedAt: new Date(version!) }, data: { value, updatedAt: now } });
        if (!result.count) throw new PublicationConflict("A colleague changed website publishing. Reload and review before continuing.");
      }
      await tx.auditLog.create({ data: {
        actorId, action: `symposium.people.${action.action}`, targetType: "people-publication",
        targetId: "id" in action ? action.id : "2026-annual-symposium",
        detail: JSON.stringify({
          revision: next.revision, initialized: next.initialized,
          before: action.action === "publish-plan" ? current.state.approved.filter((p) => action.changes.some((c) => c.id === p.id)) : "id" in action ? current.state.approved.find((p) => p.id === action.id) ?? null : null,
          after: action.action === "publish-plan" ? next.approved.filter((p) => action.changes.some((c) => c.id === p.id)) : "id" in action ? next.approved.find((p) => p.id === action.id) ?? null : null,
        }),
      } });
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") throw new PublicationConflict("A colleague saved first. Reload website publishing.");
    throw error;
  }
  return { state: next, version: now.toISOString() };
}
