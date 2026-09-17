/**
 * Script content model + persistence for the Workspace video scripts.
 *
 * A script is either "sections" (a list of titled markdown blocks stored as
 * ScriptSection rows) or "richtext" (a single TipTap JSON document on
 * Script.richContent). Either way, every save records a full ScriptRevision
 * snapshot so the history panel can show who changed what and revert.
 *
 * Server-only (imports prisma).
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ScriptFormat = "sections" | "richtext" | "html";

export interface SnapshotSection {
  heading: string;
  body: string;
  order: number;
}

export interface ScriptSnapshot {
  format: ScriptFormat;
  sections: SnapshotSection[];
  /** TipTap JSON document when format = "richtext"; null otherwise. */
  richContent: unknown | null;
}

export interface RevisionAuthor {
  /** User.id when a logged-in user saved; null for an anonymous editor. */
  userId: string | null;
  name: string;
  kind: "user" | "anon";
}

// ── Tabbed HTML docs ──
// A tab is a top-level `<div class="doc-panel…" data-tab="key">`. A panel's
// chunk runs from its opening tag to the next panel's (the "active" class
// lives in the tag, so switching tabs never reads as an edit).
const PANEL_OPEN = /<div\b[^>]*\bclass="doc-panel\b[^"]*"[^>]*\bdata-tab="([^"]+)"[^>]*>/g;

export function docPanelChunks(html: string): Map<string, string> {
  const hits = [...html.matchAll(PANEL_OPEN)];
  return new Map(hits.map((h, i) => [h[1], html.slice(h.index + h[0].length, hits[i + 1]?.index ?? html.length)]));
}

const htmlOf = (rc: unknown): string => {
  const h = (rc as { html?: unknown } | null)?.html;
  return typeof h === "string" ? h : "";
};

/** Tabs whose content differs between two versions of a tabbed doc. */
export function changedTabs(prevHtml: string, nextHtml: string): string[] {
  const prev = docPanelChunks(prevHtml);
  const next = docPanelChunks(nextHtml);
  return [...new Set([...prev.keys(), ...next.keys()])].filter((k) => prev.get(k) !== next.get(k));
}

export interface RevisionRow {
  id: string;
  authorName: string;
  authorKind: string;
  summary: string;
  createdAt: Date;
  /** Tabs this save changed; null when not recorded. */
  tabs: string[] | null;
  /** The saved doc had no tabs (made before the doc was split). */
  untabbed: boolean;
}

/** Recent revisions, newest first, without loading the snapshots. */
export function listRevisions(scriptId: string): Promise<RevisionRow[]> {
  return prisma.$queryRaw<RevisionRow[]>`
    SELECT id, "authorName", "authorKind", summary, "createdAt",
           snapshot->'tabs' AS tabs,
           position('doc-panel' in coalesce(snapshot->'richContent'->>'html', '')) = 0 AS untabbed
    FROM "ScriptRevision"
    WHERE "scriptId" = ${scriptId}
    ORDER BY "createdAt" DESC
    LIMIT 100`;
}

/** One revision's saved HTML (for restoring a single tab), or null. */
export async function revisionHtml(scriptId: string, revisionId: string): Promise<string | null> {
  const rev = await prisma.scriptRevision.findUnique({ where: { id: revisionId }, select: { scriptId: true, snapshot: true } });
  if (!rev || rev.scriptId !== scriptId) return null;
  return htmlOf((rev.snapshot as { richContent?: unknown } | null)?.richContent ?? null);
}

/** Load a script's current content as a snapshot (null if not found). */
export async function loadScriptSnapshot(scriptId: string): Promise<ScriptSnapshot | null> {
  const script = await prisma.script.findUnique({
    where: { id: scriptId },
    include: { sections: { orderBy: { order: "asc" } } },
  });
  if (!script) return null;
  return {
    format: script.format as ScriptFormat,
    sections: script.sections.map((s) => ({ heading: s.heading, body: s.body, order: s.order })),
    richContent: (script.richContent as unknown) ?? null,
  };
}

/**
 * Persist new content for a script and record a ScriptRevision. When
 * `sections` is provided the ScriptSection rows are replaced wholesale; when
 * `richContent` is provided (richtext) it's written to the Script row. The
 * full resulting snapshot is stored on the revision for one-click revert.
 */
export async function saveScriptContent(args: {
  scriptId: string;
  format?: ScriptFormat;
  sections?: SnapshotSection[];
  richContent?: unknown;
  author: RevisionAuthor;
  summary?: string;
}): Promise<ScriptSnapshot> {
  const { scriptId, author } = args;
  const script = await prisma.script.findUnique({ where: { id: scriptId } });
  if (!script) throw new Error("Script not found");
  const format = (args.format ?? script.format) as ScriptFormat;

  await prisma.$transaction(async (tx) => {
    const data: Prisma.ScriptUpdateInput = { format, updatedAt: new Date() };
    // Persist richContent for any rich format (richtext doc, or original HTML).
    if (args.richContent !== undefined) {
      data.richContent = (args.richContent ?? Prisma.JsonNull) as Prisma.InputJsonValue;
    }
    await tx.script.update({ where: { id: scriptId }, data });

    if (args.sections) {
      await tx.scriptSection.deleteMany({ where: { scriptId } });
      if (args.sections.length) {
        await tx.scriptSection.createMany({
          data: args.sections.map((s, i) => ({
            scriptId,
            order: typeof s.order === "number" ? s.order : i,
            heading: s.heading ?? "",
            body: s.body ?? "",
          })),
        });
      }
    }
  });

  const snapshot = (await loadScriptSnapshot(scriptId))!;
  const nextHtml = htmlOf(snapshot.richContent);
  const tabs = nextHtml.includes("doc-panel") ? changedTabs(htmlOf(script.richContent), nextHtml) : undefined;
  await prisma.scriptRevision.create({
    data: {
      scriptId,
      authorUserId: author.userId,
      authorName: author.name || "Someone",
      authorKind: author.kind,
      snapshot: { ...snapshot, tabs } as unknown as Prisma.InputJsonValue,
      summary: args.summary ?? "",
    },
  });
  return snapshot;
}

/** Restore a prior revision: writes its snapshot back as a new save. */
export async function revertToRevision(args: {
  scriptId: string;
  revisionId: string;
  author: RevisionAuthor;
}): Promise<ScriptSnapshot> {
  const rev = await prisma.scriptRevision.findUnique({ where: { id: args.revisionId } });
  if (!rev || rev.scriptId !== args.scriptId) throw new Error("Revision not found");
  const snap = rev.snapshot as unknown as ScriptSnapshot;
  return saveScriptContent({
    scriptId: args.scriptId,
    format: snap.format,
    sections: snap.format === "sections" ? snap.sections : undefined,
    richContent: snap.format === "sections" ? undefined : snap.richContent,
    author: args.author,
    summary: `Reverted to an earlier version`,
  });
}
