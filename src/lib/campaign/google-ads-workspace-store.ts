import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { createDefaultGoogleAdsPlan } from "./google-ads-workspace-defaults";
import {
  buildGoogleAdsHandoff, diffGoogleAdsPlans, googleAdsFeedbackActionSchema,
  googleAdsPlanSchema, saveGoogleAdsPlanSchema, workspaceActorName,
  type FeedbackItem, type GoogleAdsPlan, type GoogleAdsWorkspaceState, type WorkspaceEvent,
} from "./google-ads-workspace";

const WORKSPACE_KEY = "google_ads_workspace_v1";
const HISTORY_PAGE_SIZE = 50;
const MAX_BODY_BYTES = 512_000;
const MAX_FEEDBACK = 500;

export class GoogleAdsWorkspaceError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

interface StoredWorkspace { version: 1; revision: number; plan: GoogleAdsPlan; feedback: FeedbackItem[] }
interface StoredRow { value: string }
type NewEvent = Omit<WorkspaceEvent, "id" | "createdAt" | "actorName">;
export interface WorkspaceTransaction {
  read(): Promise<StoredRow | null>;
  create(value: string): Promise<void>;
  replace(previousValue: string, value: string): Promise<boolean>;
  appendEvent(actorId: string, event: NewEvent): Promise<void>;
}
export interface WorkspaceDatabase {
  read(): Promise<StoredRow | null>;
  history(cursor: string | undefined, take: number): Promise<WorkspaceEvent[]>;
  transaction<T>(fn: (transaction: WorkspaceTransaction) => Promise<T>): Promise<T>;
}
export interface WorkspaceActor { id: string; name?: string | null }

/** Compare-and-swap and audit insertion share one transaction; stale edits cannot overwrite another save. */
const productionDatabase: WorkspaceDatabase = {
  read: () => prisma.platformSetting.findUnique({ where: { key: WORKSPACE_KEY }, select: { value: true } }),
  history: async (cursor, take) => {
    if (cursor) {
      const existing = await prisma.auditLog.findFirst({ where: { id: cursor, targetType: "google-ads-workspace", targetId: WORKSPACE_KEY }, select: { id: true } });
      if (!existing) throw new GoogleAdsWorkspaceError(400, "The change-history cursor is invalid. Reload the workspace.");
    }
    const rows = await prisma.auditLog.findMany({
      where: { targetType: "google-ads-workspace", targetId: WORKSPACE_KEY },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, detail: true, createdAt: true, actor: { select: { name: true } } },
    });
    return rows.map((row) => {
      const detail = JSON.parse(row.detail ?? "null") as NewEvent | null;
      if (!detail || !Number.isSafeInteger(detail.revision) || !Array.isArray(detail.changes)) {
        throw new GoogleAdsWorkspaceError(503, "A saved change could not be read. The stored history has been preserved.");
      }
      return { ...detail, id: row.id, createdAt: row.createdAt.toISOString(), actorName: workspaceActorName(row.actor.name) };
    });
  },
  transaction: (fn) => prisma.$transaction(async (tx) => fn({
    read: () => tx.platformSetting.findUnique({ where: { key: WORKSPACE_KEY }, select: { value: true } }),
    create: async (value) => { await tx.platformSetting.create({ data: { key: WORKSPACE_KEY, value } }); },
    replace: async (previousValue, value) => {
      const result = await tx.platformSetting.updateMany({ where: { key: WORKSPACE_KEY, value: previousValue }, data: { value } });
      return result.count === 1;
    },
    appendEvent: async (actorId, event) => {
      await tx.auditLog.create({ data: { actorId, action: `google-ads.${event.kind}`, targetType: "google-ads-workspace", targetId: WORKSPACE_KEY, detail: JSON.stringify(event) } });
    },
  }), { isolationLevel: "Serializable", timeout: 10_000 }),
};

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
}

function readStored(row: StoredRow | null, defaults: () => GoogleAdsPlan): StoredWorkspace {
  if (!row) return { version: 1, revision: 0, plan: defaults(), feedback: [] };
  try {
    const value = JSON.parse(row.value) as StoredWorkspace;
    if (value.version !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Array.isArray(value.feedback) || value.feedback.length > MAX_FEEDBACK) throw new Error("Invalid document");
    value.plan = googleAdsPlanSchema.parse(value.plan);
    if (value.feedback.some((item) => !item.id || typeof item.body !== "string" || typeof item.section !== "string" || !["open", "resolved"].includes(item.status))) throw new Error("Invalid feedback");
    return value;
  } catch {
    throw new GoogleAdsWorkspaceError(503, "The saved workspace could not be read. It has been preserved; please ask the platform team to inspect it.");
  }
}

export function createGoogleAdsWorkspaceStore(database: WorkspaceDatabase = productionDatabase, defaults: () => GoogleAdsPlan = createDefaultGoogleAdsPlan) {
  const getState = async (historyCursor?: string): Promise<GoogleAdsWorkspaceState> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await database.read();
      const stored = readStored(before, defaults);
      const history = await database.history(historyCursor, HISTORY_PAGE_SIZE + 1);
      const after = await database.read();
      // Do not pair a newer plan with an older history and call the handoff complete.
      // Saves append the audit event in the same transaction as the document update.
      if (before?.value !== after?.value || history.some((event) => event.revision > stored.revision)) continue;
      return { revision: stored.revision, plan: stored.plan, feedback: stored.feedback,
        history: history.slice(0, HISTORY_PAGE_SIZE),
        historyNextCursor: history.length > HISTORY_PAGE_SIZE ? history[HISTORY_PAGE_SIZE - 1].id : null,
      };
    }
    throw new GoogleAdsWorkspaceError(503, "The workspace is receiving changes. Reload in a moment to get a consistent plan and change history.");
  };

  const mutate = async (actor: WorkspaceActor, operation: (stored: StoredWorkspace) => NewEvent | null) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await database.transaction(async (tx) => {
          const row = await tx.read();
          const stored = readStored(row, defaults);
          const event = operation(stored);
          if (!event) return;
          stored.revision++;
          event.revision = stored.revision;
          const value = JSON.stringify(stored);
          if (row) {
            if (!await tx.replace(row.value, value)) throw new GoogleAdsWorkspaceError(409, "Someone else saved changes. Reload the latest plan before saving yours.");
          } else await tx.create(value);
          await tx.appendEvent(actor.id, event);
        });
        return getState();
      } catch (error) {
        if (["P2002", "P2034"].includes(errorCode(error) ?? "")) {
          if (attempt < 2) continue;
          throw new GoogleAdsWorkspaceError(409, "Another save was completed at the same time. Reload the latest plan and try again.");
        }
        throw error;
      }
    }
    throw new GoogleAdsWorkspaceError(409, "The workspace changed. Reload and try again.");
  };

  return {
    getState,
    savePlan: (actor: WorkspaceActor, input: unknown) => {
      const parsed = saveGoogleAdsPlanSchema.safeParse(input);
      if (!parsed.success) throw new GoogleAdsWorkspaceError(400, parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).slice(0, 8).join("; "));
      return mutate(actor, (stored) => {
        if (stored.revision !== parsed.data.revision) throw new GoogleAdsWorkspaceError(409, "Someone else saved changes. Reload the latest plan before saving yours.");
        const changes = diffGoogleAdsPlans(stored.plan, parsed.data.plan);
        if (!changes.length) return null;
        stored.plan = parsed.data.plan;
        return { kind: "plan-saved", revision: 0, summary: parsed.data.summary, changes };
      });
    },
    feedback: (actor: WorkspaceActor, input: unknown) => {
      const parsed = googleAdsFeedbackActionSchema.safeParse(input);
      if (!parsed.success) throw new GoogleAdsWorkspaceError(400, "Add a feedback section and message, or choose a valid feedback status.");
      const action = parsed.data;
      return mutate(actor, (stored) => {
        const now = new Date().toISOString();
        if (action.action === "feedback") {
          if (stored.feedback.length >= MAX_FEEDBACK) throw new GoogleAdsWorkspaceError(409, "This workspace has reached its 500-feedback limit. Export the full history and ask the platform team to archive it before adding more; no feedback has been deleted.");
          const item: FeedbackItem = { id: randomUUID(), section: action.section, body: action.body, status: "open", createdAt: now, updatedAt: now, authorName: workspaceActorName(actor.name) };
          stored.feedback.push(item);
          return { kind: "feedback-added", revision: 0, summary: `Feedback added to ${item.section}`, feedbackId: item.id, changes: [{ path: `feedback[${item.id}]`, after: item }] };
        }
        const item = stored.feedback.find((feedback) => feedback.id === action.feedbackId);
        if (!item) throw new GoogleAdsWorkspaceError(404, "This feedback item was not found.");
        if (item.status === action.status) return null;
        const before = item.status;
        item.status = action.status;
        item.updatedAt = now;
        return { kind: action.status === "resolved" ? "feedback-resolved" : "feedback-reopened", revision: 0,
          summary: `Feedback ${action.status === "resolved" ? "resolved" : "reopened"} in ${item.section}`,
          feedbackId: item.id, changes: [{ path: `feedback[${item.id}].status`, before, after: item.status }] };
      });
    },
    getFullState: async () => {
      const state = await getState();
      const latestRevision = state.revision;
      const seen = new Set(state.history.map((event) => event.id));
      let collectedBytes = new TextEncoder().encode(JSON.stringify(state)).byteLength;
      while (state.historyNextCursor) {
        if (state.history.length >= 10_000 || collectedBytes > 10_000_000) throw new GoogleAdsWorkspaceError(413, "This history is too large for one export. Use the paginated history endpoint; no saved changes have been omitted silently.");
        const page = await database.history(state.historyNextCursor, HISTORY_PAGE_SIZE + 1);
        for (const event of page.slice(0, HISTORY_PAGE_SIZE)) if (!seen.has(event.id) && event.revision <= latestRevision) {
          collectedBytes += new TextEncoder().encode(JSON.stringify(event)).byteLength;
          if (collectedBytes > 10_000_000) throw new GoogleAdsWorkspaceError(413, "This history is too large for one export. Use the paginated history endpoint; no saved changes have been omitted silently.");
          state.history.push(event); seen.add(event.id);
        }
        state.historyNextCursor = page.length > HISTORY_PAGE_SIZE ? page[HISTORY_PAGE_SIZE - 1].id : null;
      }
      return state;
    },
  };
}

export type GoogleAdsWorkspaceStore = ReturnType<typeof createGoogleAdsWorkspaceStore>;

async function readRequestJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new GoogleAdsWorkspaceError(415, "Send JSON when saving the workspace.");
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) throw new GoogleAdsWorkspaceError(413, "This change is too large. Keep the workspace request below 500 KB.");
  const reader = request.body?.getReader();
  if (!reader) throw new GoogleAdsWorkspaceError(400, "The request body is missing.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    length += chunk.value.byteLength;
    if (length > MAX_BODY_BYTES) { await reader.cancel(); throw new GoogleAdsWorkspaceError(413, "This change is too large. Keep the workspace request below 500 KB."); }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new GoogleAdsWorkspaceError(400, "The request body is not valid JSON."); }
}

function enforceSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new GoogleAdsWorkspaceError(403, "Open this workspace on the training platform before making changes.");
  }
}

/** Injection keeps authorization, HTTP failures and body limits testable without an account or database. */
export function createGoogleAdsWorkspaceHandlers(options: { authorize: () => Promise<WorkspaceActor>; store: GoogleAdsWorkspaceStore }) {
  const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store, private" } });
  const handle = async (request: Request, method: "GET" | "PATCH" | "POST") => {
    try {
      const actor = await options.authorize();
      if (!actor.id) throw new GoogleAdsWorkspaceError(401, "Please sign in.");
      if (method === "GET") {
        const url = new URL(request.url);
        if (url.searchParams.get("format") === "handoff") {
          const content = buildGoogleAdsHandoff(await options.store.getFullState());
          if (new TextEncoder().encode(content).byteLength > 20_000_000) throw new GoogleAdsWorkspaceError(413, "This handoff is too large for one download. Use the paginated history endpoint.");
          return new Response(content, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": 'attachment; filename="biohubnet-google-ads-codex-handoff.md"', "Cache-Control": "no-store, private" } });
        }
        const cursor = url.searchParams.get("historyCursor") || undefined;
        if (cursor && !/^[a-zA-Z0-9_-]{1,100}$/.test(cursor)) throw new GoogleAdsWorkspaceError(400, "The change-history cursor is invalid.");
        return json(await options.store.getState(cursor));
      }
      enforceSameOrigin(request);
      const input = await readRequestJson(request);
      return json(method === "PATCH" ? await options.store.savePlan(actor, input) : await options.store.feedback(actor, input));
    } catch (error) {
      if (error instanceof GoogleAdsWorkspaceError) return json({ error: error.message }, error.status);
      if (error instanceof Error && error.message === "Unauthorized") return json({ error: "Please sign in." }, 401);
      if (error instanceof Error && error.message === "Forbidden") return json({ error: "Administrator access is required." }, 403);
      console.error("Google Ads workspace request failed", error instanceof Error ? error.name : "Unknown error");
      return json({ error: "The workspace could not be loaded or saved. Your previously saved changes are preserved. Please try again." }, 500);
    }
  };
  return { GET: (request: Request) => handle(request, "GET"), PATCH: (request: Request) => handle(request, "PATCH"), POST: (request: Request) => handle(request, "POST") };
}
