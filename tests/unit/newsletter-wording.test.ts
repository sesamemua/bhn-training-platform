import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import * as newsletterTypes from "../../src/lib/newsletter/types";
import type { PieceLayout, Section } from "../../src/lib/newsletter/types";
import * as handoff from "../../src/lib/newsletter/handoff";
import { renderIssue } from "../../src/lib/newsletter/render";
import { verbatimLayout } from "../../src/lib/newsletter/wording";

const require = createRequire(import.meta.url);
function load<T>(file: string, mocks: Record<string, unknown>): T {
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports: Record<string, unknown> = {};
  new Function("require", "exports", compiled)((id: string) => id in mocks ? mocks[id] : require(id), exports);
  return exports as T;
}

interface Piece {
  id: string; issueId: string; section: Section; position: number; rawBody: string;
  sourceUrl: string | null; status: string; layout: (PieceLayout & { _src?: string }) | null;
}
interface Issue {
  id: string; title: string; dateline: string; preheader: string | null; status: string;
  renderedHtml: string | null; renderedAt: Date | null; updatedAt: Date; pieces: Piece[];
}
type Context = { params: Promise<{ id: string }> };
type Route = { POST: (request: Request, context: Context) => Promise<Response> };
type Preview = { GET: (request: Request, context: Context) => Promise<Response> };
type Settings = typeof import("../../src/lib/newsletter/wording-settings");
const key = (section: Section) => `newsletter.wording.issue-1.${section}`;
const picture = { id: "picture-1", assetId: "asset-1", url: "https://images.example/graphic.png", alt: 'Event <poster> & "details"' };

function harness() {
  let issue: Issue = {
    id: "issue-1", title: "November Newsletter", dateline: "November 2026", preheader: null,
    status: "draft", renderedHtml: "<p>Saved review remains unchanged</p>",
    renderedAt: new Date("2026-11-25T10:00:00Z"), updatedAt: new Date("2026-11-25T10:00:00Z"),
    pieces: [{ id: "piece-1", issueId: "issue-1", section: "engage", position: 0,
      rawBody: "Original contributor wording.\nSecond line remains exactly as written.", sourceUrl: null,
      status: "submitted", layout: null }],
  };
  const rows = new Map<string, string>();
  const media = { sectionImages: { engage: [picture] }, imagesByPieceId: { "piece-1": [picture] } };
  let exists = true, authorized = true, conflicts = 0, transactions = 0;
  let issueWrites = 0, pieceWrites = 0, aiCalls = 0;
  let activeTransaction: number | null = null, failPieceUpdate = false;
  const writes: { kind: string; transaction: number | null }[] = [];
  let transactionHook: (() => void | Promise<void>) | undefined;
  let aiHook: (() => void | Promise<void>) | undefined;
  const touch = () => { issue.updatedAt = new Date(issue.updatedAt.getTime() + 1); };
  const db = {
    platformSetting: {
      findMany: async ({ where }: { where: { key: { startsWith: string } } }) => [...rows]
        .filter(([rowKey]) => rowKey.startsWith(where.key.startsWith)).map(([rowKey, value]) => ({ key: rowKey, value })),
      findUnique: async ({ where }: { where: { key: string } }) => rows.has(where.key) ? { value: rows.get(where.key) } : null,
      upsert: async ({ where, create, update }: { where: { key: string }; create: { value: string }; update: { value: string } }) => {
        rows.set(where.key, rows.has(where.key) ? update.value : create.value);
      },
    },
    newsletterIssue: {
      findUnique: async () => exists ? structuredClone(issue) : null,
      update: async ({ data }: { data: Partial<Issue> }) => {
        writes.push({ kind: "issue", transaction: activeTransaction });
        Object.assign(issue, data); issueWrites++; touch(); return structuredClone(issue);
      },
      updateMany: async ({ where, data }: { where: { id: string; updatedAt: Date; status?: { not: string } }; data: Partial<Issue> }) => {
        if (!exists || where.id !== issue.id || where.updatedAt.getTime() !== issue.updatedAt.getTime() || where.status?.not === issue.status) return { count: 0 };
        Object.assign(issue, data); issueWrites++; touch(); return { count: 1 };
      },
    },
    newsletterPiece: {
      findFirst: async ({ where }: { where: { id: string; issueId: string } }) => {
        const piece = issue.pieces.find((p) => p.id === where.id && p.issueId === where.issueId);
        return piece ? structuredClone(piece) : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Piece> }) => {
        writes.push({ kind: "piece", transaction: activeTransaction });
        if (failPieceUpdate) throw new Error("Injected contribution write failure");
        const piece = issue.pieces.find((p) => p.id === where.id);
        assert.ok(piece);
        Object.assign(piece, data); pieceWrites++; return structuredClone(piece);
      },
      updateMany: async ({ where, data }: { where: Pick<Piece, "id" | "issueId" | "rawBody" | "sourceUrl" | "status">; data: Partial<Piece> }) => {
        const piece = issue.pieces.find((p) => p.id === where.id && p.issueId === where.issueId && p.rawBody === where.rawBody && p.sourceUrl === where.sourceUrl && p.status === where.status);
        if (!piece) return { count: 0 };
        Object.assign(piece, data); pieceWrites++; return { count: 1 };
      },
    },
  };
  const prisma = {
    ...db,
    $transaction: async <T>(operation: (tx: typeof db) => Promise<T>) => {
      transactions++;
      if (conflicts-- > 0) throw { code: "P2034" };
      const hook = transactionHook; transactionHook = undefined;
      if (hook) await hook();
      const oldIssue = structuredClone(issue), oldRows = new Map(rows), oldIssueWrites = issueWrites, oldPieceWrites = pieceWrites;
      activeTransaction = transactions;
      try { return await operation(db); }
      catch (error) {
        issue = oldIssue; rows.clear(); oldRows.forEach((v, k) => rows.set(k, v));
        issueWrites = oldIssueWrites; pieceWrites = oldPieceWrites; throw error;
      }
      finally { activeTransaction = null; }
    },
  };
  const settings = load<Settings>("src/lib/newsletter/wording-settings.ts", {
    "server-only": {}, "@/lib/prisma": { prisma }, "./types": newsletterTypes,
  });
  const mocks = {
    "@/lib/prisma": { prisma },
    "@/lib/auth": { requireRole: async () => authorized ? { user: { id: "editor", name: "Editor" } } : null },
    "@/lib/newsletter/types": newsletterTypes,
    "@/lib/newsletter/wording": { verbatimLayout },
    "@/lib/newsletter/wording-settings": settings,
    "@/lib/newsletter/handoff": handoff,
    "@/lib/newsletter/render": { renderIssue },
    "@/lib/newsletter/media": { getNewsletterMedia: async () => media },
    "@/lib/newsletter/ai": { normalisePiece: async () => {
      aiCalls++;
      if (aiHook) await aiHook();
      return { headline: "AI headline", body: ["AI rewritten body."] };
    } },
  };
  const route = load<Route>("src/app/api/workspace/newsletter/[id]/route.ts", mocks);
  const preview = load<Preview>("src/app/api/workspace/newsletter/[id]/preview/route.ts", mocks);
  return {
    get issue() { return issue; }, rows, media, settings, touch, writes,
    send: (body: unknown, extra: Record<string, string> = {}) => route.POST(new Request("https://bhn.example/api/workspace/newsletter/issue-1", {
      method: "POST", headers: { "Content-Type": "application/json", ...extra }, body: JSON.stringify(body),
    }), { params: Promise.resolve({ id: "issue-1" }) }),
    preview: () => preview.GET(new Request("https://bhn.example/api/workspace/newsletter/issue-1/preview"), { params: Promise.resolve({ id: "issue-1" }) }),
    beforeNextTransaction: (hook: () => void | Promise<void>) => { transactionHook = hook; },
    duringAi: (hook: () => void | Promise<void>) => { aiHook = hook; },
    conflict: (count: number) => { conflicts = count; },
    setExists: (value: boolean) => { exists = value; },
    setAuthorized: (value: boolean) => { authorized = value; },
    failPieceUpdate: () => { failPieceUpdate = true; },
    stats: () => ({ issueWrites, pieceWrites, aiCalls, transactions }),
  };
}

test("wording settings default off, persist per section, and only invalidate changed exports", async () => {
  const h = harness(), originalHtml = h.issue.renderedHtml;
  assert.deepEqual(await h.settings.getPreserveWording("issue-1"), {});
  await h.settings.setPreserveWording("issue-1", "engage", false);
  assert.equal(h.rows.size, 0); assert.equal(h.stats().issueWrites, 0);
  await h.settings.setPreserveWording("issue-1", "engage", true);
  await h.settings.setPreserveWording("issue-1", "equip", true);
  assert.deepEqual(await h.settings.getPreserveWording("issue-1"), { engage: true, equip: true });
  assert.equal(h.issue.renderedAt, null); assert.equal(h.issue.renderedHtml, originalHtml);
  const writes = h.stats().issueWrites;
  await h.settings.setPreserveWording("issue-1", "engage", true);
  assert.equal(h.stats().issueWrites, writes);
  await h.settings.setPreserveWording("issue-1", "engage", false);
  assert.deepEqual(await h.settings.getPreserveWording("issue-1"), { engage: false, equip: true });
  h.rows.set("newsletter.wording.other.engage", "true");
  h.rows.set("newsletter.wording.issue-1.unknown", "invalid");
  assert.deepEqual(await h.settings.getPreserveWording("issue-1"), { engage: false, equip: true });
});

test("wording settings fail closed on corrupt values and reject missing or sent issues", async () => {
  const h = harness();
  h.rows.set(key("engage"), "not-a-boolean");
  await assert.rejects(h.settings.getPreserveWording("issue-1"), /could not be read/);
  h.issue.status = "sent";
  await assert.rejects(h.settings.setPreserveWording("issue-1", "engage", false), /Sent newsletters/);
  assert.equal(h.rows.get(key("engage")), "not-a-boolean");
  h.setExists(false);
  await assert.rejects(h.settings.setPreserveWording("issue-1", "engage", true), /Issue not found/);
  assert.equal(h.stats().issueWrites, 0);
});

test("wording settings retry serialization conflicts and report exhausted retries without writes", async () => {
  const h = harness(); h.conflict(2);
  await h.settings.setPreserveWording("issue-1", "engage", true);
  assert.equal(h.stats().transactions, 3); assert.equal(h.stats().issueWrites, 1);
  h.conflict(4);
  await assert.rejects(h.settings.setPreserveWording("issue-1", "equip", true), /Another editor/);
  assert.equal(h.rows.has(key("equip")), false);
  assert.equal(h.stats().issueWrites, 1);
});

test("wording endpoint validates access, origin, section and boolean; returns saved choices", async () => {
  const h = harness(), payload = { action: "setPreserveWording", section: "engage", preserveWording: true };
  h.setAuthorized(false); assert.equal((await h.send(payload)).status, 403); h.setAuthorized(true);
  assert.equal((await h.send(payload, { origin: "https://other.example" })).status, 403);
  assert.equal((await h.send(payload, { "sec-fetch-site": "cross-site" })).status, 403);
  assert.equal((await h.send({ ...payload, section: "arbitrary" })).status, 400);
  assert.equal((await h.send({ ...payload, preserveWording: "false" })).status, 400);
  assert.equal(h.rows.size, 0);
  const response = await h.send(payload, { origin: "https://bhn.example" });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).issue.preserveWording, { engage: true });
});

test("protected generation bypasses AI and an existing rewritten cache without altering source or cache", async () => {
  const h = harness(), piece = h.issue.pieces[0], rawBody = piece.rawBody;
  piece.layout = { headline: "Old rewritten headline", body: ["Old shortened body."], _src: rawBody };
  piece.status = "normalised";
  const oldLayout = structuredClone(piece.layout);
  h.rows.set(key("engage"), "true");
  const response = await h.send({ action: "generate" });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.match(result.html, /Original contributor wording/);
  assert.doesNotMatch(result.html, /Old rewritten|Old shortened|AI rewritten/);
  assert.equal(h.stats().aiCalls, 0); assert.equal(h.stats().pieceWrites, 0);
  assert.equal(h.issue.pieces[0].rawBody, rawBody); assert.deepEqual(h.issue.pieces[0].layout, oldLayout);
  assert.deepEqual(result.issue.preserveWording, { engage: true });
  assert.match(result.html, /graphic\.png/);
});

test("unprotected generation retains its existing AI path and can resume after protection is disabled", async () => {
  const h = harness(); h.rows.set(key("engage"), "true");
  assert.equal((await h.send({ action: "generate" })).status, 200);
  assert.equal(h.issue.pieces[0].layout, null);
  await h.settings.setPreserveWording("issue-1", "engage", false);
  assert.equal((await h.send({ action: "generate" })).status, 200);
  assert.equal(h.stats().aiCalls, 1); assert.equal(h.stats().pieceWrites, 1);
  const savedPiece: Piece = structuredClone(h.issue.pieces[0]);
  assert.equal(savedPiece.layout?._src, savedPiece.rawBody);
  assert.match(h.issue.renderedHtml!, /AI rewritten body/);
});

test("sent newsletters reject generation, imported AI layouts and wording changes", async () => {
  const h = harness(); h.issue.status = "sent";
  for (const payload of [
    { action: "generate" },
    { action: "aiApply", text: '{"pieces":[]}' },
    { action: "setPreserveWording", section: "engage", preserveWording: true },
  ]) assert.equal((await h.send(payload)).status, 409);
  assert.equal(h.stats().aiCalls, 0); assert.equal(h.stats().pieceWrites, 0); assert.equal(h.stats().issueWrites, 0);
});

test("a wording toggle while AI runs wins and no computed layout or HTML is committed", async () => {
  const h = harness(), originalHtml = h.issue.renderedHtml;
  h.duringAi(async () => { await h.settings.setPreserveWording("issue-1", "engage", true); });
  const response = await h.send({ action: "generate" });
  assert.equal(response.status, 409);
  assert.equal(h.stats().aiCalls, 1); assert.equal(h.stats().pieceWrites, 0);
  assert.equal(h.stats().issueWrites, 1, "only the explicit toggle invalidation was saved");
  assert.equal(h.issue.renderedHtml, originalHtml); assert.equal(h.issue.pieces[0].layout, null);
  assert.equal(h.issue.status, "draft");
  assert.deepEqual(await h.settings.getPreserveWording("issue-1"), { engage: true });
});

test("a changed contribution rolls back issue and layout writes at commit time", async () => {
  const h = harness(), originalHtml = h.issue.renderedHtml;
  h.beforeNextTransaction(() => { h.issue.pieces[0].rawBody = "A newer contribution version must win."; });
  const response = await h.send({ action: "generate" });
  assert.equal(response.status, 409);
  assert.equal(h.stats().issueWrites, 0); assert.equal(h.stats().pieceWrites, 0);
  assert.equal(h.issue.renderedHtml, originalHtml); assert.equal(h.issue.pieces[0].layout, null);
  assert.equal(h.issue.pieces[0].rawBody, "A newer contribution version must win.");
});

test("editing source invalidates the issue before writing copy in one atomic transaction", async () => {
  const h = harness(), originalHtml = h.issue.renderedHtml;
  const rawBody = "The contributor's updated wording is preserved.\nSecond line.";
  const response = await h.send({ action: "updatePiece", pieceId: "piece-1", rawBody, sourceUrl: "https://company.example" });
  assert.equal(response.status, 200);
  assert.deepEqual(h.writes, [{ kind: "issue", transaction: 1 }, { kind: "piece", transaction: 1 }]);
  assert.equal(h.stats().transactions, 1);
  assert.equal(h.issue.pieces[0].rawBody, rawBody);
  assert.equal(h.issue.pieces[0].sourceUrl, "https://company.example");
  assert.equal(h.issue.renderedAt, null); assert.equal(h.issue.renderedHtml, originalHtml);
  assert.equal(h.stats().aiCalls, 0);
});

test("a failed source edit rolls back both issue invalidation and contribution changes", async () => {
  const h = harness(), original = structuredClone(h.issue);
  h.failPieceUpdate();
  await assert.rejects(h.send({ action: "updatePiece", pieceId: "piece-1", rawBody: "This source edit cannot be saved.", sourceUrl: "https://company.example" }), /Injected contribution write failure/);
  assert.deepEqual(h.writes, [{ kind: "issue", transaction: 1 }, { kind: "piece", transaction: 1 }]);
  assert.deepEqual(h.issue, original);
  assert.equal(h.stats().issueWrites, 0); assert.equal(h.stats().pieceWrites, 0);
});

test("AI handoff preserves protected copy and only writes permitted pieces", async () => {
  const h = harness(); h.rows.set(key("engage"), "true");
  h.issue.pieces.push({ ...h.issue.pieces[0], id: "piece-2", section: "equip", rawBody: "Unprotected funding opportunity." });
  const brief = await (await h.send({ action: "aiBrief" })).json();
  assert.doesNotMatch(brief.brief, /Original contributor wording/);
  assert.match(brief.brief, /Unprotected funding opportunity/);
  const response = await h.send({ action: "aiApply", text: JSON.stringify({ pieces: [
    { id: "piece-1", layout: { headline: "Forbidden rewrite", body: ["Changed protected copy."] } },
    { id: "piece-2", layout: { headline: "Funding", body: ["Permitted new layout."] } },
  ] }) });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.report.preserved, [{ id: "piece-1", section: "engage" }]);
  assert.equal(h.issue.pieces[0].layout, null); assert.equal(h.stats().pieceWrites, 1);
  assert.equal(h.issue.pieces[1].layout?.headline, "Funding");
  assert.equal(h.issue.renderedAt, null);
});

test("AI handoff aborts without any layout writes when the issue changes before commit", async () => {
  const h = harness(), originalHtml = h.issue.renderedHtml;
  h.beforeNextTransaction(h.touch);
  const response = await h.send({ action: "aiApply", text: JSON.stringify({ pieces: [
    { id: "piece-1", layout: { headline: "New", body: ["New layout."] } },
  ] }) });
  assert.equal(response.status, 409);
  assert.equal(h.stats().pieceWrites, 0); assert.equal(h.stats().issueWrites, 0);
  assert.equal(h.issue.renderedHtml, originalHtml); assert.equal(h.issue.pieces[0].layout, null);
});

test("protected preview uses complete current source rather than a stale cache or 400-character fallback", async () => {
  const h = harness(); h.rows.set(key("engage"), "true");
  const raw = "A complete introduction.\n\n" + "Exact long content — do not shorten. ".repeat(45) + "LAST WORDS MUST SURVIVE";
  h.issue.pieces[0].rawBody = raw;
  for (const cache of [null, { headline: "Outdated heading", body: ["Outdated body"] }]) {
    h.issue.pieces[0].layout = cache;
    const response = await h.preview(); assert.equal(response.status, 200);
    const result = await response.json();
    assert.ok(result.html.includes(raw));
    assert.match(result.html, /LAST WORDS MUST SURVIVE/);
    assert.doesNotMatch(result.html, /Outdated heading|Not yet laid out/);
    assert.equal(result.unrendered, 0);
  }
  assert.equal(h.stats().aiCalls, 0); assert.equal(h.stats().issueWrites, 0);
});

test("verbatim rendering preserves literal wording, links and spacing while escaping markup and keeping images", () => {
  const raw = '  A <script>alert("not executable")</script> & **literal** heading\n\n• A bullet with  two spaces.\nVisit https://company.example/path?q=one&value=two.\nFinal line.  ';
  const layout = verbatimLayout(raw, "https://source.example/apply");
  assert.equal(layout.verbatimBody, raw); assert.equal(layout.headline, "");
  const bySection = { top: [], engage: [layout], experience: [], equip: [], event: [] };
  const html = renderIssue({ dateline: "November 2026", bySection, idsBySection: { engage: ["piece-1"] }, imagesByPieceId: { "piece-1": [picture] } });
  assert.doesNotMatch(html, /<script>|<h2/);
  assert.match(html, /&lt;script&gt;alert\(&quot;not executable&quot;\)&lt;\/script&gt;/);
  assert.match(html, /href="https:\/\/company\.example\/path\?q=one&amp;value=two"/);
  assert.match(html, /href="https:\/\/source\.example\/apply"/);
  assert.match(html, /alt="Event &lt;poster&gt; &amp; &quot;details&quot;"/);
  assert.match(html, /white-space:pre-wrap/);
  const text = html.match(/<div[^>]*data-nl-part="Original wording"[^>]*>([\s\S]*?)<\/div>/)![1]
    .replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  assert.equal(text, raw);
  const unsafe = renderIssue({ dateline: "November", bySection: { ...bySection, engage: [verbatimLayout("Plain source.", "javascript:alert(1)")] } });
  assert.doesNotMatch(unsafe, /javascript:|href=/);
});
