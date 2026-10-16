import test from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import { PrintBoardSchema, type PrintBoard } from "../../src/lib/events/print-jobs";

type Row = { key: string; value: string; updatedAt: Date };
let rows = new Map<string, Row>(), race = false, transactions = 0;
const prisma = {
  platformSetting: { findUnique: async ({ where }: { where: { key: string } }) => rows.get(where.key) ?? null },
  bhnEvent: { findUnique: async () => ({ speakers: [] }) },
  $transaction: async (fn: (tx: unknown) => Promise<void>) => {
    transactions++;
    const staged = new Map(rows);
    const tx = { platformSetting: {
      create: async ({ data }: { data: Row }) => { if (staged.has(data.key)) throw Object.assign(new Error("duplicate"), { code: "P2002" }); staged.set(data.key, { ...data, updatedAt: data.updatedAt ?? new Date() }); return data; },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        const row = staged.get(where.key);
        if (race || !row || row.value !== where.value || row.updatedAt.getTime() !== where.updatedAt.getTime()) return { count: 0 };
        staged.set(where.key, { ...row, ...data }); return { count: 1 };
      },
    } };
    await fn(tx);
    rows = staged;
  },
} as unknown as PrismaClient;
Reflect.set(globalThis, "prisma", prisma);
const server = import("../../src/lib/events/print-store");
const key = "symposium2026.printJobs.v1", version = "2026-10-16T15:00:00.000Z";
const board = (): PrintBoard => PrintBoardSchema.parse({ guests: [{ id: "one", name: "Jane Smith", email: "jane.smith@example.org", organization: "UofT", status: "approved", tickets: 1, source: "luma" }], edits: {}, jobs: [], syncedAt: version, tentText: "BioHubNet", agendaText: "Current agenda", tentTemplate: null, agendaTemplate: null });
const reset = () => { rows = new Map([[key, { key, value: JSON.stringify(board()), updatedAt: new Date(version) }]]); race = false; transactions = 0; };
const create = { action: "create" as const, kind: "badges" as const, label: "Batch 1", ids: ["one"], copies: 1, assignedTo: "Colleague", notes: "", allowReprint: false, skip: 0, offsetX: 0, offsetY: 0 };

test("empty storage reads the verified 2026 agenda and never writes during GET", async () => {
  rows = new Map(); const { loadPrintStore } = await server;
  const result = await loadPrintStore();
  assert.match(result.snapshot.board.agendaText, /Christopher Procyshyn/);
  assert.ok(!result.snapshot.board.agendaText.includes("Future of Biomanufacturing"));
  assert.equal(rows.size, 0);
});

test("stale versions cannot overwrite shared badge edits", async () => {
  reset(); const { changePrintStore } = await server;
  const result = await changePrintStore(null, create, "Admin");
  assert.equal(result.conflict, true); assert.equal(transactions, 0);
});

test("PDF bytes and queue metadata are committed atomically and remain fixed after edits", async () => {
  reset(); const { changePrintStore, printJobPdf } = await server;
  const result = await changePrintStore(version, create, "Admin");
  assert.equal(result.conflict, false); assert.ok(result.jobId);
  const before = await printJobPdf(result.jobId!);
  assert.ok(before?.bytes.subarray(0, 5).toString() === "%PDF-");
  assert.equal(before?.job.printedIds.length, 0);
  const edited = await changePrintStore(result.snapshot.version, { action: "edit", id: "one", badge: { name: "Jane Smith", organization: "Changed company", extra: "HQP Representative", reviewed: true } }, "Admin");
  assert.equal(edited.conflict, false);
  assert.deepEqual((await printJobPdf(result.jobId!))?.bytes, before?.bytes);
  assert.equal((await printJobPdf(result.jobId!))?.job.badges[0].organization, "University of Toronto");
  assert.equal(await printJobPdf("non-job-template"), null);
});

test("a compare-and-swap race rolls the PDF insert back together with the queue change", async () => {
  reset(); race = true; const { changePrintStore } = await server;
  assert.equal((await changePrintStore(version, create, "Admin")).conflict, true);
  assert.equal(rows.size, 1);
  assert.equal(JSON.parse(rows.get(key)!.value).jobs.length, 0);
});

test("corrupt stored data is not reset or overwritten", async () => {
  reset(); rows.get(key)!.value = "bad JSON";
  const { loadPrintStore } = await server;
  await assert.rejects(loadPrintStore());
  assert.equal(rows.get(key)!.value, "bad JSON");
});
