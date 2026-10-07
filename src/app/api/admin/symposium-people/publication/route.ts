import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";
import { requireRole } from "@/lib/auth";
import { loadPeoplePlan } from "@/lib/events/people-plan-store";
import { PublicationAction } from "@/lib/events/people-publication";
import { loadPublication, savePublication, profileHash, PublicationConflict } from "@/lib/events/people-publication-store";
import { freezePublicationPhoto } from "@/lib/events/publication-photo";
import { plannerPublicationChanges } from "@/lib/events/planner-publication";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function GET() {
  if (!await requireRole("admin").catch(() => null)) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  try {
    const [publication, roster] = await Promise.all([loadPublication(), loadPeoplePlan()]);
    return NextResponse.json({ ...publication, raw: undefined, roster: roster.snapshot, hashes: Object.fromEntries(publication.state.drafts.map((p) => [p.id, profileHash(p.profile)])) }, { headers });
  } catch {
    return NextResponse.json({ error: "Couldn't load website publishing." }, { status: 503, headers });
  }
}
export async function POST(req: Request) {
  const session = await requireRole("admin").catch(() => null);
  const actorId = (session?.user as { id?: string } | undefined)?.id;
  if (!actorId) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  const origin = req.headers.get("origin");
  if (origin !== new URL(req.url).origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403, headers });
  const text = await req.text();
  if (text.length > 2500000) return NextResponse.json({ error: "Publication request is too large." }, { status: 413, headers });
  let json: unknown;
  try { json = JSON.parse(text); } catch { return NextResponse.json({ error: "Invalid input." }, { status: 400, headers }); }
  const parsed = z.object({ version: z.string().datetime().nullable(), change: z.union([PublicationAction, z.object({ action: z.literal("preview-plan") }).strict()]) }).strict().safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the public profile fields." }, { status: 400, headers });
  try {
    const { version, change } = parsed.data;
    const current = await loadPublication();
    if (version !== current.version) throw new PublicationConflict("A colleague changed website publishing. Reload and review.");
    if (change.action === "preview-plan" || change.action === "publish-plan") {
      const { snapshot } = await loadPeoplePlan();
      const rosterHash = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
      if (change.action === "publish-plan" && change.rosterHash !== rosterHash) throw new PublicationConflict("The planner or a speaker submission changed. Close this preview and review the latest changes.");
      const changes = plannerPublicationChanges(current.state, snapshot);
      // Freeze every proposed photo before displaying the approval preview.
      for (let i = 0; i < changes.length; i += 4) {
        await Promise.all(changes.slice(i, i + 4).map(async (entry) => {
          if (entry.profile) entry.profile.photoUrl = await freezePublicationPhoto(entry.profile.photoUrl);
        }));
      }
      if (change.action === "preview-plan") return NextResponse.json({ changes, rosterHash, version: current.version, initialized: current.state.initialized,
        before: current.state.approved.filter((p) => changes.some((c) => c.id === p.id)),
      }, { headers });
      if (JSON.stringify(change.changes) !== JSON.stringify(changes)) throw new PublicationConflict("The public details or headshots changed. Close this preview and review again.");
    } else if (text.length > 32000) return NextResponse.json({ error: "Profile is too large." }, { status: 413, headers });
    if (change.action === "save" || change.action === "approve") {
      const { snapshot } = await loadPeoplePlan();
      if (!snapshot.people.some((p) => p.id === change.id && !p.archived)) return NextResponse.json({ error: "Choose an active roster profile." }, { status: 400, headers });
    }
    if (change.action === "save") change.profile.photoUrl = await freezePublicationPhoto(change.profile.photoUrl);
    const result = await savePublication(version, change, actorId);
    return NextResponse.json({ ...result, hashes: Object.fromEntries(result.state.drafts.map((p) => [p.id, profileHash(p.profile)])) }, { headers });
  } catch (error) {
    if (error instanceof PublicationConflict) return NextResponse.json({ error: error.message }, { status: 409, headers });
    console.error("[people-publication] mutation failed", error);
    return NextResponse.json({ error: error instanceof Error && !/prisma|database|\n/i.test(error.message) ? error.message : "Couldn't save website publishing." }, { status: 400, headers });
  }
}
