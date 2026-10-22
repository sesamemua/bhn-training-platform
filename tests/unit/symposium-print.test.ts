import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { extractText } from "unpdf";
import { PrintActionSchema, PrintBoardSchema, applyPrintAction, attentionItems, capitalizeName, mergePrintGuests, printPeople, standardOrganization, type PrintAction, type PrintBoard, type PrintGuest } from "../../src/lib/events/print-jobs";
import { fetchLumaPrintGuests, lumaPrintPage, parseLumaPrintCsv } from "../../src/lib/events/print-luma";
import { badgePosition, buildPrintPdf } from "../../src/lib/events/print-pdf";
import { DEFAULT_PRINT_AGENDA } from "../../src/lib/events/print-agenda";
import { PRINT_SIGNS } from "../../src/lib/events/print-signage";
import { SESSIONS } from "../../src/lib/training-week/schedule-2026";

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
  for (const name of ["AstraZeneca", "ASTRAZENECA CANADA", "AstraZeneca Canada Inc."]) assert.equal(standardOrganization(name), "AstraZeneca Canada");
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
  const edited = change(original, { action: "edit", id: "luma:gst-1", badge: { name: "Jane O'Neill", organization: "University of Toronto", extra: "HQP Representative", reviewed: true }, reason: "Correct surname confirmed by attendee", evidence: "Attendee email" }).board;
  assert.equal(original.guests[0].name, "Jane Smith");
  assert.equal(edited.guests[0].name, "Jane Smith");
  const synced = mergePrintGuests(edited, [guest({ name: "JANE SMITH" })], at);
  const person = printPeople(synced)[0];
  assert.equal(person.name, "Jane O'Neill");
  assert.equal(person.sourceName, "JANE SMITH");
  assert.equal(person.extra, "HQP Representative");
  assert.equal(change(synced, create()).job!.badges[0].name, "Jane O'Neill");
  assert.deepEqual(synced.nameHistory, [{ guestId: "luma:gst-1", from: "Jane Smith", to: "Jane O'Neill", reason: "Correct surname confirmed by attendee", evidence: "Attendee email", at, by: "Admin" }]);
});

test("surname checks accept agreeing exact-email sources, reject initials, repeated names and conflicts, and leave complete names and overrides alone", () => {
  const b = board();
  b.guests = [guest({ name: "Anna B" }), guest({ id: "repeat", name: "Reema", email: "repeat@example.org" }), guest({ id: "conflict", name: "Sam", email: "conflict@example.org" }), guest({ id: "complete", name: "jane smith", email: "complete@example.org" })];
  const identities = [
    { fullName: "Anna Bojagora", email: "jane.smith@example.org", organization: "", title: "", source: "Eligibility list" },
    { fullName: "Anna Bojagora", email: "jane.smith@example.org", organization: "", title: "", source: "People roster" },
    { fullName: "Reema Reema", email: "repeat@example.org", organization: "", title: "" },
    { fullName: "Sam Smith", email: "conflict@example.org", organization: "", title: "" },
    { fullName: "Sam Jones", email: "conflict@example.org", organization: "", title: "" },
    { fullName: "Someone Else", email: "complete@example.org", organization: "", title: "" },
  ];
  const people = printPeople(b, identities);
  assert.equal(people.find(p => p.id === "luma:gst-1")!.name, "Anna Bojagora");
  assert.ok(people.find(p => p.id === "luma:gst-1")!.nameCorrection);
  assert.ok(people.find(p => p.id === "repeat")!.issues.some(i => i.includes("incomplete")));
  assert.ok(people.find(p => p.id === "conflict")!.issues.some(i => i.includes("Multiple")));
  const verified = applyPrintAction(b, people, { action: "verify_names" }, "Admin", id, at).board;
  assert.deepEqual(Object.keys(verified.edits), ["luma:gst-1"]);
  assert.equal(verified.nameHistory?.length, 1);
  assert.match(verified.nameHistory![0].evidence, /Eligibility list/);
  assert.equal(verified.guests.find(g => g.id === "complete")!.name, "jane smith");
  const synced = mergePrintGuests(verified, b.guests.map(g => ({ ...g, name: g.id === "luma:gst-1" ? "Anna" : g.name })), at);
  assert.equal(printPeople(synced, identities).find(p => p.id === "luma:gst-1")!.name, "Anna Bojagora");
  assert.deepEqual(synced.nameHistory, verified.nameHistory);
  assert.equal(applyPrintAction(synced, printPeople(synced, identities), { action: "verify_names" }, "Other admin", id, at).board.nameHistory?.length, 1);
});

test("name changes require a reason and later edits append history without changing batch labels or PDFs", () => {
  const b = change(board(), create()).board;
  const action = { action: "edit" as const, id: "luma:gst-1", badge: { name: "Jane Doe", organization: "UofT", extra: "", reviewed: true } };
  assert.throws(() => change(b, action), /reason/);
  const first = change(b, { ...action, reason: "Attendee supplied missing surname", evidence: "Email" }).board;
  const next = applyPrintAction(first, printPeople(first), { ...action, badge: { ...action.badge, name: "Jane O'Neill" }, reason: "Attendee corrected spelling" }, "Second admin", id, "2026-10-17T15:00:00.000Z").board;
  assert.equal(next.nameHistory?.length, 2);
  assert.equal(next.nameHistory?.[1].from, "Jane Doe");
  assert.equal(next.nameHistory?.[1].by, "Second admin");
  assert.deepEqual(next.jobs, b.jobs);
  assert.equal(next.jobs[0].label, "First badge batch");
  assert.equal(next.guests[0].name, "Jane Smith");
  assert.equal(PrintActionSchema.parse({ ...action, reason: "Correction", nameHistory: [{ by: "Imposter" }] }).action, "edit");
  assert.ok(!("nameHistory" in PrintActionSchema.parse({ ...action, reason: "Correction", nameHistory: [] })));
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

test("Tuesday workshops share one sign while Innovation Ignited stays separate", () => {
  assert.deepEqual(PRINT_SIGNS.map(s => s.title), ["Communication Chameleon & Negotiation Navigator", "Innovation Ignited"]);
  const comms = SESSIONS.find(s => s.slug === "communication-chameleon-2026")!;
  const negotiation = SESSIONS.find(s => s.slug === "negotiation-skills-2026")!;
  for (const key of ["day", "start", "end"] as const) assert.equal(comms[key], negotiation[key], "Combined signage requires a shared schedule");
  assert.equal(comms.venue.name, negotiation.venue.name);
  assert.equal(PRINT_SIGNS[0].venue, "Top of POD (3rd floor)");
  assert.deepEqual(PRINT_SIGNS[0].sessions, [{ title: comms.title, facilitator: comms.facilitator }, { title: negotiation.title, facilitator: negotiation.facilitator }]);
  assert.equal(PRINT_SIGNS[0].facilitator, "Claudia Ferryman & Glen Whyte");
  assert.equal(PRINT_SIGNS[0].time.replace(/\./g, ""), "12:00 PM - 4:30 PM ET");
  assert.equal(PRINT_SIGNS[1].venue, SESSIONS.find(s => s.slug === "innovation-showcase-2026")!.venue.name);
  assert.match(PRINT_SIGNS[0].date, /Tuesday, October 27, 2026/);
  assert.match(PRINT_SIGNS[1].date, /Wednesday, October 28, 2026/);
  assert.throws(() => change(board(), create({ kind: "signage", ids: [] })), /Choose a signage/);
  assert.equal(PrintActionSchema.safeParse({ ...create({ kind: "signage" }), signageSlug: "unknown" }).success, false);
  assert.doesNotThrow(() => PrintBoardSchema.parse(change(board(), create()).board));
  const legacy = change(board(), create({ kind: "signage", signageSlug: "tuesday-workshops-2026" })).job!;
  legacy.signage = { title: "Communication Chameleon", date: legacy.signage!.date, time: legacy.signage!.time, venue: comms.venue.name!, facilitator: "Claudia Ferryman" };
  assert.doesNotThrow(() => PrintBoardSchema.parse({ ...board(), jobs: [legacy] }), "Earlier individual signage snapshots remain readable");
});

test("all signage PDFs are Letter, one page per copy, with frozen event details and no guest data", async () => {
  for (const sign of PRINT_SIGNS) {
    const original = board();
    const result = change(original, create({ kind: "signage", signageSlug: sign.slug, ids: [], copies: 2 }));
    const job = result.job!;
    assert.equal(original.jobs.length, 0);
    assert.equal(job.status, "ready");
    assert.equal(job.badges.length, 0);
    assert.equal(job.printedAt, null);
    assert.notEqual(job.signage, sign);
    const bytes = await buildPrintPdf(job, result.board);
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 2);
    for (const page of pdf.getPages()) assert.deepEqual(page.getSize(), { width: 612, height: 792 });
    const text = (await extractText(bytes, { mergePages: true })).text;
    const expected = sign.sessions ? sign.sessions.flatMap(session => [session.title, `Host: ${session.facilitator}`]) : [sign.title, sign.facilitator];
    for (const value of [...expected, sign.date, sign.time, sign.venue]) assert.ok(text.includes(value));
    if (sign.sessions) {
      assert.ok(text.indexOf("Communication Chameleon") < text.indexOf("Host: Claudia Ferryman"));
      assert.ok(text.indexOf("Host: Claudia Ferryman") < text.indexOf("Negotiation Navigator"));
      assert.ok(text.indexOf("Negotiation Navigator") < text.indexOf("Host: Glen Whyte"));
      for (const removed of ["Leslie L. Dan", "Pharmacy Building", "144 College St", "M5S 3M2"]) assert.ok(!text.includes(removed));
      assert.deepEqual(job.signage?.sessions, sign.sessions);
      assert.notEqual(job.signage?.sessions, sign.sessions);
    } else assert.ok(text.includes("144 College St"));
    assert.ok(!text.includes("Jane Smith"));
    assert.ok(!text.includes("jane.smith@example.org"));
    const printed = change(result.board, { action: "printed", jobId: id, ids: [] }).board;
    assert.equal(printed.jobs[0].status, "printed");
  }
});

test("reserved table and seat tents keep both faces, copies and Wi-Fi artwork independent", async () => {
  const template = await PDFDocument.create();
  template.addPage([612, 792]).drawText("WIFI TEMPLATE ONLY");
  const templateBytes = await template.save();
  for (const tentStyle of ["table-reserved", "seat-reserved"] as const) {
    const b = board(); b.tentTemplate = { key: "wifi-template", name: "Wi-Fi.pdf" };
    const result = change(b, create({ kind: "tents", tentStyle, copies: 2, ids: [] }));
    assert.equal(result.job!.tentStyle, tentStyle);
    assert.equal(result.job!.status, "ready");
    assert.deepEqual(result.board.tentTemplate, b.tentTemplate);
    assert.equal(result.board.tentText, b.tentText);
    const bytes = await buildPrintPdf(result.job!, result.board, templateBytes);
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 2);
    for (const page of pdf.getPages()) assert.deepEqual(page.getSize(), { width: 612, height: 792 });
    const text = (await extractText(bytes, { mergePages: true })).text;
    assert.equal(text.match(/RESERVED/g)?.length, 4);
    assert.ok(text.includes(tentStyle === "table-reserved" ? "TABLE" : "SEAT"));
    assert.ok(text.includes("2026 Annual Symposium"));
    assert.ok(!text.includes("WIFI TEMPLATE ONLY"));
    assert.equal(PrintBoardSchema.safeParse({ ...result.board, jobs: [{ ...result.job!, kind: "agenda" }] }).success, false);
  }
  assert.throws(() => change(board(), create({ kind: "agenda", tentStyle: "table-reserved" })), /only for table tents/);
  assert.equal(PrintActionSchema.safeParse({ ...create({ kind: "tents" }), tentStyle: "unknown" }).success, false);
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

test("the position prints above the organization, comes from Luma or the CSV, and an edit can change it", () => {
  const page = lumaPrintPage({ entries: [{ api_id: "gst-9", name: "Lee Park", email: "lee@example.org", approval_status: "approved",
    registration_answers: [{ label: "Current Primary Affiliation Position", value: "PhD Candidate" }, { label: "Primary Affiliated Organization Name", value: "UofT" }], event_tickets: [{}] }], has_more: false });
  assert.equal(page.guests[0].position, "PhD Candidate");
  const csv = parseLumaPrintCsv("Name,Email,Approval Status,Current Primary Affiliation Position,Primary Affiliated Organization Name\nLee Park,lee@example.org,Approved,Postdoctoral Fellow,UofT\n");
  assert.equal(csv[0].position, "Postdoctoral Fellow");
  const b = PrintBoardSchema.parse({ guests: page.guests, edits: {}, jobs: [], syncedAt: null, tentText: "", agendaText: "", tentTemplate: null, agendaTemplate: null });
  assert.equal(printPeople(b)[0].position, "PhD Candidate");
  b.edits[page.guests[0].id] = { name: "Lee Park", position: "Research Associate", organization: "University of Toronto", extra: "", reviewed: true };
  assert.equal(printPeople(b)[0].position, "Research Associate");
});

test("a batch can be deleted outright, whatever its state, and only once", () => {
  const job = { id: "11111111-1111-4111-8111-111111111111", label: "Agenda draft", kind: "agenda" as const, createdAt: new Date().toISOString(), createdBy: "A", assignedTo: "", notes: "", copies: 1, status: "printed" as const, badges: [], printedIds: [], printedAt: null, printedBy: null, skip: 0, offsetX: 0, offsetY: 0 };
  const b = PrintBoardSchema.parse({ guests: [], edits: {}, jobs: [job], syncedAt: null, tentText: "", agendaText: "x", tentTemplate: null, agendaTemplate: null });
  const after = applyPrintAction(b, [], { action: "delete", jobId: job.id }, "Admin", "new", new Date().toISOString()).board;
  assert.equal(after.jobs.length, 0);
  assert.throws(() => applyPrintAction(after, [], { action: "delete", jobId: job.id }, "Admin", "new", new Date().toISOString()), /already been deleted/);
});

test("a last name added to a badge survives every Luma sync, even when Luma's own name changes", () => {
  const g = { id: "luma:gst-7", name: "Echo", email: "echo.jing@example.org", organization: "UofT", status: "approved", tickets: 1, source: "luma" as const, badgeRole: "" };
  let b = PrintBoardSchema.parse({ guests: [g], edits: {}, jobs: [], syncedAt: null, tentText: "", agendaText: "", tentTemplate: null, agendaTemplate: null });
  b.edits[g.id] = { name: "Echo Jing", organization: "University of Toronto", extra: "", reviewed: true };
  b = mergePrintGuests(b, [{ ...g }], new Date().toISOString());
  assert.equal(printPeople(b)[0].name, "Echo Jing", "an unchanged sync keeps the edit");
  b = mergePrintGuests(b, [{ ...g, name: "Echo J." }], new Date().toISOString());
  assert.equal(printPeople(b)[0].name, "Echo Jing", "a changed Luma name still does not replace the edit");
  assert.equal(b.guests[0].name, "Echo J.", "Luma's own record is kept as Luma has it");
  assert.equal(b.edits[g.id].reviewed, false, "and the change is flagged for a second look");
});
