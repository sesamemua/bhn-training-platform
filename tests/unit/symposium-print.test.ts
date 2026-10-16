import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { extractText } from "unpdf";
import { applyPrintAction, attentionItems, capitalizeName, mergePrintGuests, printPeople, standardOrganization, type PrintAction, type PrintBoard, type PrintGuest } from "../../src/lib/events/print-jobs";
import { fetchLumaPrintGuests, lumaPrintPage, parseLumaPrintCsv } from "../../src/lib/events/print-luma";
import { badgePosition, buildPrintPdf } from "../../src/lib/events/print-pdf";
import { DEFAULT_PRINT_AGENDA } from "../../src/lib/events/print-agenda";

const at = "2026-10-16T15:00:00.000Z";
const id = "00000000-0000-4000-8000-000000000001";
const guest = (values: Partial<PrintGuest> = {}): PrintGuest => ({ id: "luma:gst-1", name: "Jane Smith", email: "jane.smith@example.org", organization: "U of T", status: "approved", tickets: 1, source: "luma", badgeRole: "", ...values });
const board = (): PrintBoard => ({ guests: [guest()], edits: {}, jobs: [], syncedAt: at, tentText: "BioHubNet\n2026 Annual Symposium", agendaText: DEFAULT_PRINT_AGENDA, tentTemplate: null, agendaTemplate: null });
const create = (overrides: Partial<Extract<PrintAction, { action: "create" }>> = {}): Extract<PrintAction, { action: "create" }> => ({ action: "create", kind: "badges", label: "First badge batch", ids: ["luma:gst-1"], copies: 1, assignedTo: "Colleague", notes: "Actual size 100%", allowReprint: false, skip: 0, offsetX: 0, offsetY: 0, ...overrides });
const change = (b: PrintBoard, a: Parameters<typeof applyPrintAction>[2]) => applyPrintAction(b, printPeople(b), a, "Admin", id, at);

test("known organization spellings converge without inventing unknown company names", () => {
  for (const name of ["uoft", "U of T", "U. of T.", "UNIVERSITY OF TORONTO", "University of Toronto, Department of Chemistry", "UofT Scarborough"]) assert.equal(standardOrganization(name), "University of Toronto");
  assert.equal(standardOrganization("tmu"), "Toronto Metropolitan University");
  assert.equal(standardOrganization("BoutIQ Solutions"), "BoutIQ Solutions");
  assert.equal(standardOrganization("Uotf"), "University of Toronto");
  assert.equal(standardOrganization("UHN/U of T"), "University Health Network/ University of Toronto");
});

test("capitalization preserves internal capitals, initials, apostrophes and accents", () => {
  assert.equal(capitalizeName("purnima chadha"), "Purnima Chadha");
  assert.equal(capitalizeName("MOLLY SHOICHET"), "Molly Shoichet");
  assert.equal(capitalizeName("Samantha McWhirter"), "Samantha McWhirter");
  assert.equal(capitalizeName("KJ AITKEN"), "KJ Aitken");
  assert.equal(capitalizeName("o'neill MCDONALD"), "O'Neill McDonald");
  assert.equal(capitalizeName("  Élodie   Lévesque "), "Élodie Lévesque");
});

test("organizer-confirmed Andrea is resolved; other organization names and mismatches stay flagged", () => {
  const b = board();
  b.guests = [guest({ name: "HI³ Hub", email: "an.leung@utoronto.ca" }), guest({ id: "other", name: "BioHubNet", email: "a.stirling@utoronto.ca" }), guest({ id: "mismatch", name: "Patience Obi", email: "alexandre.carnet@example.org" })];
  const people = printPeople(b);
  assert.equal(people.find(p => p.email === "an.leung@utoronto.ca")!.name, "Andrea Leung");
  assert.ok(people.find(p => p.id === "other")!.issues.includes("Name appears to be an organization"));
  const mismatch = people.find(p => p.id === "mismatch")!;
  assert.equal(mismatch.name, "Patience Obi");
  assert.equal(mismatch.suggestion, "Alexandre Carnet");
  assert.ok(mismatch.issues.some(i => i.includes("inconsistent")));
});

test("only a unique email match can complete a profile or carry an explicit HQP role", () => {
  const b = board(); b.guests = [guest({ name: "Alice", email: "alice@example.org" })];
  const people = printPeople(b, [{ fullName: "Alice Feng", email: "alice@example.org", organization: "BoutIQ Solutions", title: "Computational Scientist · HQP Representative" }]);
  assert.equal(people[0].name, "Alice Feng");
  assert.equal(people[0].extra, "HQP Representative");
  assert.equal(printPeople(board())[0].extra, "");
});

test("sync preserves edits, previous batches, removed records and manual people", () => {
  let b = board();
  b = change(b, { action: "edit", id: "luma:gst-1", badge: { name: "Jane Smith", organization: "Custom organization", extra: "HQP Representative", reviewed: true } }).board;
  b = change(b, create()).board;
  b.guests.push(guest({ id: "manual", source: "manual" }));
  const next = mergePrintGuests(b, [guest({ name: "JANE SMITH" }), guest({ id: "new", name: "New Person", email: "new@example.org" })], at);
  assert.equal(next.edits["luma:gst-1"].organization, "Custom organization");
  assert.equal(next.edits["luma:gst-1"].reviewed, false);
  assert.equal(next.jobs.length, 1);
  assert.ok(next.guests.some(g => g.id === "manual"));
  const missing = mergePrintGuests(next, [guest({ id: "new", name: "New Person", email: "new@example.org" })], at);
  assert.equal(missing.guests.find(g => g.id === "luma:gst-1")!.status, "removed");
  assert.throws(() => mergePrintGuests(b, [guest(), guest()], at), /duplicate/);
});

test("platform print-name edits survive Luma sync without changing the original registration name", () => {
  const original = board();
  const edited = change(original, { action: "edit", id: "luma:gst-1", badge: { name: "Jane O'Neill", organization: "University of Toronto", extra: "HQP Representative", reviewed: true } }).board;
  assert.equal(original.guests[0].name, "Jane Smith");
  assert.equal(edited.guests[0].name, "Jane Smith");
  const synced = mergePrintGuests(edited, [guest({ name: "JANE SMITH" })], at);
  const person = printPeople(synced)[0];
  assert.equal(person.name, "Jane O'Neill");
  assert.equal(person.sourceName, "JANE SMITH");
  assert.equal(person.extra, "HQP Representative");
  assert.equal(change(synced, create()).job!.badges[0].name, "Jane O'Neill");
});

test("creating and downloading a batch is not printing; snapshots do not change with later edits", () => {
  const original = board(), result = change(original, create());
  assert.equal(printPeople(original)[0].printStatus, "unprinted");
  assert.equal(printPeople(result.board)[0].printStatus, "queued");
  assert.equal(result.board.jobs[0].printedIds.length, 0);
  const printed = change(result.board, { action: "printed", jobId: id, ids: ["luma:gst-1"] }).board;
  assert.equal(printPeople(printed)[0].printStatus, "printed");
  const edited = change(printed, { action: "edit", id: "luma:gst-1", badge: { name: "Jane Smith", organization: "University of Toronto", extra: "HQP Representative", reviewed: true } }).board;
  assert.equal(printPeople(edited)[0].printStatus, "changed");
  assert.equal(edited.jobs[0].badges[0].extra, "");
  assert.equal(printed.edits["luma:gst-1"], undefined);
});

test("partial printing and cancellation keep physical print history and release only unprinted badges", () => {
  const b = board(); b.guests.push(guest({ id: "two", name: "Other Person", email: "other@example.org" }));
  const ready = change(b, create({ ids: ["luma:gst-1", "two"] })).board;
  const partial = change(ready, { action: "printed", jobId: id, ids: ["luma:gst-1"] }).board;
  assert.equal(partial.jobs[0].status, "ready");
  assert.equal(printPeople(partial).find(p => p.id === "two")!.printStatus, "queued");
  const cancelled = change(partial, { action: "cancel", jobId: id }).board;
  assert.equal(printPeople(cancelled).find(p => p.id === "luma:gst-1")!.printStatus, "printed");
  assert.equal(printPeople(cancelled).find(p => p.id === "two")!.printStatus, "unprinted");
});

test("server refuses pending, flagged, repeated and foreign badge selections", () => {
  const b = board(); b.guests[0].status = "pending_approval";
  assert.throws(() => change(b, create()), /Only approved/);
  b.guests[0].status = "approved"; b.guests[0].name = "BioHubNet";
  assert.throws(() => change(b, create()), /Resolve/);
  assert.throws(() => change(board(), create({ ids: ["foreign"] })), /current guest/);
  const queued = change(board(), create()).board;
  assert.throws(() => change(queued, create()), /printed or queued/);
  assert.doesNotThrow(() => change(queued, create({ allowReprint: true })));
  assert.throws(() => change(queued, { action: "printed", jobId: id, ids: ["foreign"] }), /from this batch/);
});

test("multi-ticket bookings are flagged instead of producing duplicate name badges", () => {
  const b = board(); b.guests[0].tickets = 12;
  assert.ok(printPeople(b)[0].issues.some(i => i.includes("additional guests")));
  assert.equal(change(b, create()).job!.badges.length, 1);
});

test("Luma response extracts only required badge data and leaves sensitive answers out", () => {
  const page = lumaPrintPage({ entries: [{ api_id: "gst-1", name: "Jane Smith", email: "JANE@EXAMPLE.ORG", approval_status: "approved", registration_answers: [{ label: "Primary Affiliated Organization Name", value: "UofT" }, { label: "Special Dietary Requirements", value: "PRIVATE" }, { label: "Symposium Participant", value: ["HQP Representative"] }], event_tickets: [{ invalidated_at: null }, { invalidated_at: "cancelled" }] }], has_more: false, next_cursor: null });
  assert.equal(page.guests[0].organization, "UofT");
  assert.equal(page.guests[0].email, "jane@example.org");
  assert.equal(page.guests[0].tickets, 1);
  assert.equal(page.guests[0].badgeRole, "HQP Representative");
  assert.ok(!JSON.stringify(page).includes("PRIVATE"));
});

test("Luma reads every page and refuses missing, looping, partial or expired responses", async t => {
  const previous = process.env.LUMA_SESSION_KEY;
  process.env.LUMA_SESSION_KEY = "test-only-session";
  t.after(() => { if (previous === undefined) delete process.env.LUMA_SESSION_KEY; else process.env.LUMA_SESSION_KEY = previous; });
  let calls = 0;
  const entry = (id: string) => ({ api_id: id, name: "Jane Smith", email: "jane@example.org", approval_status: "approved" });
  const fetcher = (async (url: URL | RequestInfo) => {
    calls++;
    if (calls === 2) assert.equal(new URL(String(url)).searchParams.get("pagination_cursor"), "next");
    return Response.json({ entries: [entry("gst-" + calls)], has_more: calls === 1, next_cursor: calls === 1 ? "next" : null });
  }) as typeof fetch;
  assert.equal((await fetchLumaPrintGuests(fetcher)).length, 2);
  await assert.rejects(fetchLumaPrintGuests((async () => Response.json({ entries: [], has_more: true })) as typeof fetch), /incomplete/);
  await assert.rejects(fetchLumaPrintGuests((async () => new Response("", { status: 401 })) as typeof fetch), /expired/);
  await assert.rejects(fetchLumaPrintGuests((async () => Response.json({ entries: [], has_more: false })) as typeof fetch), /empty/);
});

test("CSV import requires identity and approval data rather than assuming everyone is approved", () => {
  const guests = parseLumaPrintCsv("api_id,name,email,approval_status,Primary Affiliated Organization Name\ngst-1,Jane Smith,jane@example.org,approved,UofT\n");
  assert.equal(guests[0].id, "luma:gst-1");
  assert.equal(guests[0].organization, "UofT");
  assert.throws(() => parseLumaPrintCsv("name,email\nJane Smith,jane@example.org\n"), /Approval Status/);
  const group = parseLumaPrintCsv("guest_id,name,email,approval_status,Primary Affiliated Organization Name\ngst-1,Jane Smith,jane@example.org,approved,UofT\ngst-1,Jane Smith,jane@example.org,approved,UofT\n");
  assert.equal(group.length, 1); assert.equal(group[0].tickets, 2);
  assert.throws(() => parseLumaPrintCsv("guest_id,name,email,approval_status\ngst-1,Jane Smith,jane@example.org,approved\ngst-1,Other Person,other@example.org,approved\n"), /conflicting/);
});

test("Avery 5393 positions are six exact 4-by-3-inch badges and support partly used sheets", () => {
  const options = { skip: 0, offsetX: 0, offsetY: 0 };
  assert.deepEqual(badgePosition(0, options), { page: 0, x: 18, y: 72 });
  assert.deepEqual(badgePosition(5, options), { page: 0, x: 306, y: 504 });
  assert.deepEqual(badgePosition(6, options), { page: 1, x: 18, y: 72 });
  assert.equal(badgePosition(0, { ...options, skip: 5 }).x, 306);
  assert.equal(badgePosition(1, { ...options, skip: 5 }).page, 1);
  assert.ok(badgePosition(0, { ...options, offsetX: 1 }).x > 20);
});

test("badge PDFs preserve accents and extra lines, fit Letter and paginate at six", async () => {
  const b = board(), job = change(b, create()).job!;
  job.badges = Array.from({ length: 7 }, (_, i) => ({ id: String(i), name: "Élodie Lévesque", organization: "University of Toronto", extra: "HQP Representative" }));
  const bytes = await buildPrintPdf(job, b), pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 2);
  assert.deepEqual(pdf.getPage(0).getSize(), { width: 612, height: 792 });
  const text = (await extractText(bytes, { mergePages: true })).text;
  assert.ok(text.includes("Élodie Lévesque"));
  assert.ok(text.includes("HQP Representative"));
  job.badges[0].name = "X".repeat(160);
  await assert.rejects(buildPrintPdf(job, b), /too long/);
});

test("table tents default to 22 copies of one design; agenda and uploaded artwork generate PDFs", async () => {
  const b = board(), job = change(b, create({ kind: "tents", copies: 22 })).job!;
  const tents = await PDFDocument.load(await buildPrintPdf(job, b));
  assert.equal(tents.getPageCount(), 22);
  const agendaJob = { ...job, kind: "agenda" as const, copies: 1 };
  const agenda = await buildPrintPdf(agendaJob, b);
  assert.ok((await extractText(agenda, { mergePages: true })).text.includes("October 29, 2026"));
  assert.ok(!DEFAULT_PRINT_AGENDA.includes("2025"));
  const original = await PDFDocument.create(); original.addPage([612, 792]);
  const custom = await PDFDocument.load(await buildPrintPdf(job, b, await original.save()));
  assert.equal(custom.getPageCount(), 22);
});

test("needs attention: checks before printing, reprints, badges for people who left, unnamed guests", () => {
  const person = (over: Record<string, unknown>) => ({ id: "x", name: "Ada Lovelace", organization: "Analytical Engines", extra: "", email: "ada@example.org", sourceName: "Ada Lovelace", sourceOrganization: "", status: "approved", source: "luma" as const, tickets: 1, issues: [] as string[], suggestion: null, printStatus: "unprinted" as const, ...over });
  const items = attentionItems([
    person({ id: "a", name: "Zed Quinn", issues: ["Organization missing"] }),
    person({ id: "b", name: "Bo Chen", printStatus: "changed" }),
    person({ id: "c", name: "Cy Diaz", status: "cancelled", printStatus: "printed" }),
    person({ id: "d", name: "Di Evans", tickets: 3, issues: ["3 tickets: additional guests need individual names"] }),
    person({ id: "e", name: "Ed Fox" }),
    person({ id: "f", name: "Flo Gray", status: "pending", issues: ["Organization missing"] }),
  ] as never);
  assert.deepEqual(items.map((i) => `${i.kind}:${i.id}`), ["review:a", "reprint:b", "unregistered:c", "guests:d"]);
  assert.match(items[3].detail, /2 additional guests need a name/);
  assert.match(items[0].detail, /Organization missing/);
});
