import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

test("generation and AI hand-off keep attached media, return a flat issue, and reject stale saves", async () => {
  const require = createRequire(import.meta.url);
  const compiled = ts.transpileModule(readFileSync("src/app/api/workspace/newsletter/[id]/route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const layout = { headline: "Partner event", body: ["Event details."], _src: "Event contribution" };
  const updatedAt = new Date("2026-11-16T12:00:00Z");
  const issue: any = { id: "issue", dateline: "November 2026", updatedAt, pieces: [{ id: "piece", section: "event", rawBody: "Event contribution", layout, status: "normalised" }] };
  const media = {
    sectionImages: { event: [{ id: "section-picture", assetId: "asset-1", url: "https://images.example/1.png", alt: "Poster" }] },
    imagesByPieceId: { piece: [{ id: "piece-picture", assetId: "asset-2", url: "https://images.example/2.png", alt: "Event" }] },
  };
  let concurrentChange = false, renderInput: any, saved = 0, normalised = 0;
  class WordingError extends Error { constructor(message: string, public status = 400) { super(message); } }
  const db = {
    newsletterIssue: {
      findUnique: async () => issue,
      updateMany: async ({ where, data }: any) => {
        assert.equal(where.updatedAt, updatedAt);
        if (concurrentChange) return { count: 0 };
        if (data.renderedHtml) { saved++; assert.equal(data.renderedHtml, "Rendered with pictures"); }
        else assert.equal(data.renderedAt, null);
        return { count: 1 };
      },
    },
    newsletterPiece: { updateMany: async () => ({ count: 1 }) },
    $transaction: async (operation: (tx: unknown) => Promise<unknown>) => operation(db),
  };
  const mocks: Record<string, unknown> = {
    "@/lib/auth": { requireRole: async () => ({ user: { id: "editor" } }) },
    "@/lib/prisma": { prisma: db },
    "@/lib/newsletter/ai": { normalisePiece: async () => { normalised++; return layout; } },
    "@/lib/newsletter/render": { renderIssue: (input: any) => { renderInput = input; return "Rendered with pictures"; } },
    "@/lib/newsletter/media": { getNewsletterMedia: async () => media },
    "@/lib/newsletter/wording-settings": { getPreserveWording: async () => ({}), NewsletterWordingError: WordingError },
    "@/lib/newsletter/handoff": { parseAiReturn: () => ({ ok: true, applied: [{ id: "piece", layout }] }) },
  };
  const exports: { POST?: (request: Request, context: unknown) => Promise<Response> } = {};
  new Function("require", "exports", compiled)((id: string) => mocks[id] ?? require(id), exports);
  const call = (body: unknown) => exports.POST!(new Request("https://bhn.example/api/workspace/newsletter/issue", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: "issue" }) });

  const generated = await (await call({ action: "generate" })).json();
  assert.equal(normalised, 0, "unchanged contributor copy is not regenerated");
  assert.deepEqual(renderInput.idsBySection, { event: ["piece"] });
  assert.deepEqual(renderInput.sectionImages, media.sectionImages);
  assert.deepEqual(renderInput.imagesByPieceId, media.imagesByPieceId);
  assert.deepEqual(generated.issue.imagesByPieceId, media.imagesByPieceId);
  const applied = await (await call({ action: "aiApply", text: "validated by hand-off parser" })).json();
  assert.equal(applied.issue.id, "issue");
  assert.equal(applied.issue.issue, undefined, "AI reply uses the same issue response contract as other actions");
  assert.deepEqual(applied.issue.sectionImages, media.sectionImages);

  concurrentChange = true;
  assert.equal((await call({ action: "generate" })).status, 409);
  assert.equal(saved, 1, "a stale generation must not mark newer pictures as rendered");
  concurrentChange = false;
  issue.pieces = [];
  assert.equal((await call({ action: "generate" })).status, 200, "a section-only picture can be exported without dummy text");
});
