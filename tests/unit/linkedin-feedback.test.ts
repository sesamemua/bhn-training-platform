import test from "node:test";
import assert from "node:assert/strict";
import { LinkedinAction, LinkedinBoard, LinkedinInput, LinkedinFeedbackProfile, changeLinkedinBoard, publicLinkedinTestimonials } from "../../src/lib/events/linkedin";
import { linkedinFeedbackClipboard } from "../../src/lib/events/linkedin-feedback-copy";

const at = "2026-11-04T18:00:00.000Z";
function fixture() {
  return changeLinkedinBoard(LinkedinBoard.parse({ entries: [], checkedAt: null, coverage: "Internal coverage" }), { action: "add", entry: LinkedinInput.parse({ author: "Attendee", kind: "mention", topic: "symposium", sourceUrl: "https://www.linkedin.com/feed/update/urn:li:activity:123", sourceText: "Thank you!\nA useful conversation with new connections.", reply: "Private reply draft" }) }, "Admin", at);
}

test("legacy entries stay private; publication is an explicit verbatim selection with attribution", () => {
  const board = fixture(), entry = board.entries[0];
  entry.notes = "Private note";
  assert.deepEqual(publicLinkedinTestimonials(board), []);
  const published = changeLinkedinBoard(board, { action: "testimonial", id: entry.id, quote: "A useful conversation with new connections.", publish: true }, "Curator", at);
  const visible = publicLinkedinTestimonials(published);
  assert.deepEqual(visible, [{ author: "Attendee", quote: "A useful conversation with new connections.", sourceUrl: entry.sourceUrl, kind: "mention", topic: "symposium", publishedAt: at }]);
  for (const secret of ["Private note", "Private reply draft", "Curator", "Internal coverage", "updatedBy", "observedAt"]) assert.ok(!JSON.stringify(visible).includes(secret));
  assert.equal(published.entries[0].reply, entry.reply);
  assert.equal(published.entries[0].notes, entry.notes);
  assert.equal(entry.testimonial, undefined, "Original board is immutable");
  assert.equal(published.entries[0].testimonial?.publishedBy, "Curator");
  const removed = changeLinkedinBoard(published, { action: "testimonial", id: entry.id, quote: "", publish: false }, "Curator", at);
  assert.deepEqual(publicLinkedinTestimonials(removed), []);
  assert.equal(removed.entries[0].sourceText, entry.sourceText);
});

test("private sources, reactions and rewritten or overlong quotes cannot be published", () => {
  for (const change of [{ kind: "message" as const }, { kind: "reaction" as const }, { sourceUrl: "https://www.linkedin.com/company/102677155/admin/inbox/thread/private" }, { sourceUrl: "https://www.linkedin.com:8443/feed/update/urn:li:activity:123" }]) {
    const board = fixture(), entry = board.entries[0];
    Object.assign(entry, change);
    assert.throws(() => changeLinkedinBoard(board, { action: "testimonial", id: entry.id, quote: "Thank you!", publish: true }, "Admin", at), /verbatim/);
    entry.testimonial = { quote: "Thank you!", publishedBy: "Admin", publishedAt: at };
    assert.deepEqual(publicLinkedinTestimonials(board), [], "Tampered publication flags cannot expose private sources");
  }
  const board = fixture(), id = board.entries[0].id;
  for (const quote of ["", "An amazing guaranteed career!", "x".repeat(1201)]) assert.throws(() => changeLinkedinBoard(board, { action: "testimonial", id, quote, publish: true }, "Admin", at), /verbatim/);
  assert.equal(LinkedinAction.safeParse({ action: "testimonial", id, quote: "x".repeat(1201), publish: true }).success, false);
  assert.throws(() => changeLinkedinBoard(board, { action: "testimonial", id: "missing", quote: "Thank you!", publish: true }, "Admin", at), /no longer/);
});

test("rescans preserve curation and reply drafts, but removed source excerpts disappear publicly", () => {
  const board = fixture(), entry = board.entries[0];
  const published = changeLinkedinBoard(board, { action: "testimonial", id: entry.id, quote: "Thank you! A useful conversation", publish: true }, "Curator", at);
  assert.equal(publicLinkedinTestimonials(published).length, 1, "Whitespace differences are allowed");
  const rescanned = changeLinkedinBoard(published, { action: "import", entries: [{ ...entry, sourceText: "Author replaced their post", reply: "New generated reply" }], coverage: "Rescan" }, "Scanner", at);
  assert.deepEqual(rescanned.entries[0].testimonial, published.entries[0].testimonial);
  assert.equal(rescanned.entries[0].reply, "Private reply draft");
  assert.deepEqual(publicLinkedinTestimonials(rescanned), []);
});

test("Word clipboard has readable plain text, escaped rich text, attribution and source links", () => {
  const quote = { author: 'A & B <Team>', quote: '<img src=x onerror="alert(1)">\nUseful & inspiring.', sourceUrl: "https://www.linkedin.com/feed/update/urn:li:activity:123?dashCommentUrn=a&other=b", kind: "comment" as const, topic: "symposium" as const, publishedAt: at, profile: { title: "Researcher & mentor", affiliation: "A <University>", photoUrl: "", profileUrl: "" } };
  const content = linkedinFeedbackClipboard([quote, { ...quote, author: "Second attendee" }]);
  assert.ok(content.text.includes(`${quote.author}\n${quote.profile.title}\n${quote.profile.affiliation}\n${quote.sourceUrl}`));
  assert.ok(content.html.includes("&lt;img"));
  assert.ok(content.html.includes("A &amp; B &lt;Team&gt;"));
  assert.ok(content.html.includes("<br>Useful &amp; inspiring."));
  assert.ok(content.html.includes("&amp;other=b"));
  assert.ok(!content.html.includes("<img"));
  assert.ok(content.html.includes("Researcher &amp; mentor<br>A &lt;University&gt;"));
  assert.ok(content.text.includes("Researcher & mentor\nA <University>"));
  assert.ok(content.html.includes("Original LinkedIn comment"));
  assert.equal((content.html.match(/<blockquote>/g) ?? []).length, 2);
  assert.deepEqual(linkedinFeedbackClipboard([]), { text: "", html: "" });
});

test("public profile fields are validated and kept when a quote is updated without replacing attribution", () => {
  const profile = { title: "Researcher", affiliation: "University", photoUrl: "/feedback/2026/attendee.jpg", profileUrl: "https://www.linkedin.com/in/attendee/" };
  assert.equal(LinkedinFeedbackProfile.safeParse(profile).success, true);
  for (const photoUrl of ["javascript:alert(1)", "data:image/svg+xml,evil", "http://example.com/p.jpg", "/api/admin/private", "https://u:p@example.com/image.jpg", "https://example.com:8080/image.jpg"]) assert.equal(LinkedinFeedbackProfile.safeParse({ ...profile, photoUrl }).success, false);
  assert.equal(LinkedinFeedbackProfile.safeParse({ ...profile, profileUrl: "javascript:alert(1)" }).success, false);
  const board = fixture(), id = board.entries[0].id;
  const published = changeLinkedinBoard(board, { action: "testimonial", id, quote: "Thank you!", publish: true, profile }, "Admin", at);
  const edited = changeLinkedinBoard(published, { action: "testimonial", id, quote: "A useful conversation", publish: true }, "Admin", at);
  assert.deepEqual(publicLinkedinTestimonials(edited)[0].profile, profile);
  assert.equal(edited.entries[0].reply, "Private reply draft");
});
