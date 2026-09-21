/**
 * POST /api/profile/resume/master/ai-tailor/apply
 *
 * Accept a subset of suggestions returned by the preview endpoint and
 * insert them into the target Resume's structured content tree.
 *
 *   body: {
 *     resumeId: string;
 *     suggestions: Array<{
 *       bulletId:        string;   // master bullet id — recorded as derivedFromMasterBulletId
 *       body:            string;   // final text to write (may differ from the AI rewrite if the user tweaked it)
 *       sectionKind:     string;   // ResumeSectionKind
 *       anchorTitle?:    string;
 *       anchorSubtitle?: string;
 *     }>;
 *   }
 *
 * Algorithm:
 *   For each suggestion we locate (or create) a section of the
 *   requested kind in the resume's content tree, then locate (or
 *   create) an item with the requested anchor (title + subtitle). The
 *   bullet is appended to that item, tagged with
 *   `derivedFromMasterBulletId` so the promotion chip can detect
 *   future edits, and marked `aiSuggested: true` so the editor
 *   highlights it until the user confirms.
 *
 * One revision is written with triggeredBy="ai_tailor" so the version
 * history captures the moment.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveResume } from "@/lib/resume/active";
import { recordRevision } from "@/lib/resume/revisions";
import {
  type ResumeContent, type ResumeSection, type ResumeItem,
  type ResumeSectionKind, rid,
} from "@/lib/resume/types";

export const runtime = "nodejs";

const VALID_KINDS: ReadonlySet<ResumeSectionKind> = new Set<ResumeSectionKind>([
  "summary", "experience", "skills", "education", "projects",
  "certifications", "publications", "awards", "volunteering", "other",
]);

interface InboundSuggestion {
  bulletId: string;
  body: string;
  sectionKind: ResumeSectionKind;
  anchorTitle: string | null;
  anchorSubtitle: string | null;
}

export async function POST(req: NextRequest) {
  const session = await requireSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id?: string }).id ?? null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    resumeId?: unknown;
    suggestions?: unknown;
  };
  const resumeId = typeof body.resumeId === "string" ? body.resumeId : null;
  if (!resumeId) {
    return NextResponse.json({ error: "resumeId required" }, { status: 400 });
  }
  if (!Array.isArray(body.suggestions) || body.suggestions.length === 0) {
    return NextResponse.json({ error: "At least one suggestion required." }, { status: 400 });
  }

  // Coerce + validate each suggestion. Drop malformed rows silently —
  // the UI shouldn't be able to send them, so a bad row is a bug; we
  // log and skip rather than 400 the whole batch.
  const suggestions: InboundSuggestion[] = [];
  const rejected: Array<{ index: number; reason: string }> = [];
  body.suggestions.forEach((raw, i) => {
    if (!raw || typeof raw !== "object") {
      rejected.push({ index: i, reason: "Not an object" });
      return;
    }
    const r = raw as Record<string, unknown>;
    const bulletId = typeof r.bulletId === "string" ? r.bulletId : null;
    const text = typeof r.body === "string" ? r.body.trim() : "";
    const kindRaw = typeof r.sectionKind === "string" ? r.sectionKind : "";
    const anchorTitle = typeof r.anchorTitle === "string" && r.anchorTitle.trim() ? r.anchorTitle.trim() : null;
    const anchorSubtitle = typeof r.anchorSubtitle === "string" && r.anchorSubtitle.trim() ? r.anchorSubtitle.trim() : null;
    if (!bulletId) { rejected.push({ index: i, reason: "Missing bulletId" }); return; }
    if (!text) { rejected.push({ index: i, reason: "Empty body" }); return; }
    if (!VALID_KINDS.has(kindRaw as ResumeSectionKind)) {
      rejected.push({ index: i, reason: `Unknown sectionKind: ${kindRaw}` });
      return;
    }
    suggestions.push({
      bulletId,
      body: text,
      sectionKind: kindRaw as ResumeSectionKind,
      anchorTitle,
      anchorSubtitle,
    });
  });

  if (suggestions.length === 0) {
    return NextResponse.json(
      { error: "No usable suggestions in the payload.", rejected },
      { status: 400 },
    );
  }

  const target = await getActiveResume({ userId, resumeId });
  if (!target) {
    return NextResponse.json({ error: "Target resume not found." }, { status: 404 });
  }

  // Confirm the master bullets are actually the caller's — defends
  // against a forged payload that pastes someone else's bullet ids.
  const bulletIds = Array.from(new Set(suggestions.map((s) => s.bulletId)));
  const ownedBullets = await prisma.masterBullet.findMany({
    where: {
      id: { in: bulletIds },
      master: { userId },
    },
    select: { id: true },
  });
  const ownedSet = new Set(ownedBullets.map((b) => b.id));
  const ownedSuggestions = suggestions.filter((s) => ownedSet.has(s.bulletId));
  if (ownedSuggestions.length === 0) {
    return NextResponse.json(
      { error: "None of the supplied bullets belong to your master library." },
      { status: 403 },
    );
  }

  // Load the full content tree, mutate, persist + write a revision.
  const resume = await prisma.resume.findUnique({
    where: { id: target.id },
    select: { id: true, content: true, version: true },
  });
  if (!resume) {
    return NextResponse.json({ error: "Target resume disappeared mid-write." }, { status: 410 });
  }
  const current = resume.content as unknown as ResumeContent;
  const next: ResumeContent = JSON.parse(JSON.stringify(current ?? { sections: [] }));
  if (!Array.isArray(next.sections)) next.sections = [];

  let inserted = 0;
  for (const s of ownedSuggestions) {
    const section = findOrCreateSection(next, s.sectionKind);
    const item = findOrCreateItem(section, s.anchorTitle, s.anchorSubtitle);
    item.bullets.push({
      id: rid(),
      position: item.bullets.length,
      body: s.body,
      aiSuggested: true,
      derivedFromMasterBulletId: s.bulletId,
    });
    inserted++;
  }

  // Re-normalise bullet positions within touched items so they're
  // 0..N-1 contiguous (defensive — older imports sometimes left
  // duplicate positions inside the same item).
  for (const sec of next.sections) {
    for (const it of sec.items) {
      it.bullets.forEach((b, i) => { b.position = i; });
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.resume.update({
      where: { id: resume.id },
      data: {
        content: next as unknown as object,
        version: { increment: 1 },
        lastEditedAt: new Date(),
      },
      select: { id: true, version: true },
    });
    await recordRevision(tx, {
      resumeId: r.id,
      version: r.version,
      content: next as unknown as object,
      triggeredBy: "ai_tailor",
      note: `AI tailor — pulled ${inserted} bullet${inserted === 1 ? "" : "s"} from master library`,
    });
    return r;
  });

  return NextResponse.json({
    ok: true,
    inserted,
    rejected,
    version: updated.version,
    content: next,
  });
}

/** Locate the first section of the requested kind. If none exists,
 *  append a new one to the end of the section list at the next
 *  available position. */
function findOrCreateSection(content: ResumeContent, kind: ResumeSectionKind): ResumeSection {
  const existing = content.sections.find((s) => s.kind === kind);
  if (existing) return existing;
  const nextPosition = content.sections.length;
  const created: ResumeSection = {
    id: rid(),
    kind,
    position: nextPosition,
    items: [],
  };
  content.sections.push(created);
  return created;
}

/** Locate an item inside a section that matches the (anchorTitle,
 *  anchorSubtitle) pair. Match is case-insensitive whitespace-
 *  normalised. If none matches, create a fresh item with the anchor
 *  populated.
 *
 *  Special case: when both anchor fields are null AND the section is
 *  `skills` (which conventionally has a single anchorless item), we
 *  re-use the first existing item rather than spawning a new
 *  anchorless duplicate. */
function findOrCreateItem(
  section: ResumeSection,
  anchorTitle: string | null,
  anchorSubtitle: string | null,
): ResumeItem {
  const norm = (s: string | null | undefined) =>
    (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const wantTitle = norm(anchorTitle);
  const wantSub = norm(anchorSubtitle);

  const existing = section.items.find((it) =>
    norm(it.title) === wantTitle && norm(it.subtitle) === wantSub,
  );
  if (existing) return existing;

  if (section.kind === "skills" && !anchorTitle && !anchorSubtitle && section.items.length > 0) {
    return section.items[0];
  }

  const created: ResumeItem = {
    id: rid(),
    position: section.items.length,
    title: anchorTitle ?? undefined,
    subtitle: anchorSubtitle ?? undefined,
    bullets: [],
  };
  section.items.push(created);
  return created;
}
