import test from "node:test";
import assert from "node:assert/strict";
import { makeAnchor, locate, splitLines, neighbours, relocateAll } from "../../src/lib/codereview/anchor";

/**
 * The job: paste v1, leave notes, somebody edits, paste v2 — and the
 * notes still mean something. Every test here is a way v2 differs from
 * v1. The failure that matters most is a note silently landing on the
 * wrong line, which is worse than no note at all.
 */

const V1 = [
  "<table>",
  "  <tr>",
  "    <td>Hello</td>",
  "  </tr>",
  "  <tr>",
  "    <td>Goodbye</td>",
  "  </tr>",
  "</table>",
].join("\n");

test("line endings from any operating system count the same", () => {
  assert.equal(splitLines("a\r\nb\rc\nd").length, 4);
});

test("an anchor records the line's text and its neighbours", () => {
  const a = makeAnchor(V1, 3)!;
  assert.equal(a.lineText, "<td>Hello</td>");
  assert.equal(a.before, "<tr>");
  assert.equal(a.after, "</tr>");
});

test("a line number outside the paste anchors to nothing", () => {
  assert.equal(makeAnchor(V1, 0), null);
  assert.equal(makeAnchor(V1, 99), null);
});

test("nothing changed — the note stays put", () => {
  const a = makeAnchor(V1, 3)!;
  assert.deepEqual(locate(a, V1), { line: 3, kind: "exact" });
});

test("lines inserted above — the note follows its text", () => {
  const a = makeAnchor(V1, 3)!;
  const v2 = "<!-- a new comment -->\n<!-- and another -->\n" + V1;
  assert.deepEqual(locate(a, v2), { line: 5, kind: "moved" });
});

test("lines removed above — the note follows upward", () => {
  const a = makeAnchor(V1, 6)!;
  const v2 = splitLines(V1).filter((_, i) => i !== 1 && i !== 3).join("\n");
  const got = locate(a, v2);
  assert.equal(got.kind, "moved");
  assert.equal(splitLines(v2)[got.line! - 1].trim(), "<td>Goodbye</td>");
});

test("THE HTML PROBLEM: identical lines are told apart by their neighbours", () => {
  // </td> appears hundreds of times in a Mailchimp export and every one
  // is an exact match. Position alone would guess.
  const code = [
    "<tr>", "<td>", "First cell", "</td>", "</tr>",
    "<tr>", "<td>", "Second cell", "</td>", "</tr>",
  ].join("\n");
  const second = makeAnchor(code, 9)!;      // the second </td>
  assert.equal(second.before, "Second cell");
  // Push everything down; the neighbour is what finds it.
  const v2 = "<!-- x -->\n<!-- y -->\n<!-- z -->\n" + code;
  const got = locate(second, v2);
  assert.equal(splitLines(v2)[got.line! - 1].trim(), "</td>");
  assert.equal(splitLines(v2)[got.line! - 2].trim(), "Second cell", "it found the wrong </td>");
});

test("an unchanged line at its own number is exact, even among identical ones", () => {
  const code = ["<td></td>", "<td></td>", "<td></td>"].join("\n");
  assert.deepEqual(locate(makeAnchor(code, 2)!, code), { line: 2, kind: "exact" });
});

test("identical lines with identical neighbours are a GUESS, and say so", () => {
  /*
   * A run of identical cells: the note's old position is gone and every
   * surviving candidate has the same line above and below it, so
   * neighbours cannot help either. There is no right answer — which is
   * exactly why the answer must be labelled a guess rather than pinned
   * confidently to somebody else's cell.
   */
  const v1 = new Array(8).fill("<td></td>").join("\n");
  const a = makeAnchor(v1, 7)!;
  const v2 = new Array(5).fill("<td></td>").join("\n");
  const got = locate(a, v2);
  assert.equal(got.kind, "ambiguous", "an unsure match must not claim to be certain");
  assert.ok(got.line !== null && got.line >= 1 && got.line <= 5);
});

test("but when the neighbours DO single one out, that is a real match", () => {
  const v1 = new Array(6).fill("<td></td>").join("\n");
  const a = makeAnchor(v1, 6)!;                    // last one: nothing below
  const v2 = "<p>new</p>\n" + new Array(3).fill("<td></td>").join("\n");
  const got = locate(a, v2);
  assert.equal(got.kind, "moved");
  assert.equal(got.line, 4, "the only candidate with nothing below it");
});

test("the line was re-indented — still found, and flagged as loose", () => {
  const a = makeAnchor(V1, 3)!;
  const v2 = V1.replace("    <td>Hello</td>", "\t\t\t<td>Hello</td>");
  assert.deepEqual(locate(a, v2), { line: 3, kind: "exact" },
    "indentation is trimmed before comparing, so this is still exact");
});

test("attribute spacing changed — found loosely, not lost", () => {
  // What an editor actually does by accident: a second space between
  // attributes, or a different case in the tag.
  const code = '<a href="x" title="y">Read more</a>';
  const a = makeAnchor(code, 1)!;
  const got = locate(a, '<a  href="x"  title="y">Read more</a>');
  assert.equal(got.kind, "loose");
  assert.equal(got.line, 1);
});

test("case changed in a tag — still found", () => {
  const a = makeAnchor("<TD>Hello</TD>", 1)!;
  assert.equal(locate(a, "<td>Hello</td>").kind, "loose");
});

test("the line is gone — the note is ORPHANED, never moved somewhere wrong", () => {
  const a = makeAnchor(V1, 3)!;
  const v2 = V1.replace("    <td>Hello</td>\n", "");
  assert.deepEqual(locate(a, v2), { line: null, kind: "orphaned" });
});

test("an orphan is not quietly pinned to the nearest survivor", () => {
  // The whole point. Landing on somebody else's markup and claiming to
  // be a note about it is worse than admitting the line is gone.
  const a = makeAnchor(V1, 3)!;
  const got = locate(a, "<p>an entirely different document</p>");
  assert.equal(got.line, null);
});

test("a note on a blank line survives only where a blank line remains", () => {
  const code = "a\n\nb";
  const a = makeAnchor(code, 2)!;
  assert.equal(a.lineText, "");
  assert.equal(locate(a, code).kind, "exact");
  assert.equal(locate(a, "a\nb").kind, "orphaned");
});

test("an empty paste orphans everything rather than throwing", () => {
  const a = makeAnchor(V1, 3)!;
  assert.equal(locate(a, "").kind, "orphaned");
});

test("a whole set relocates at once, keeping each note's identity", () => {
  const notes = [
    { id: "n1", anchor: makeAnchor(V1, 3)! },
    { id: "n2", anchor: makeAnchor(V1, 6)! },
  ];
  const v2 = "<!-- shifted -->\n" + V1;
  const out = relocateAll(notes, v2);
  assert.deepEqual(out.map((n) => n.id), ["n1", "n2"]);
  assert.equal(out[0].located.line, 4);
  assert.equal(out[1].located.line, 7);
});

test("neighbours skip blank lines, or indentation style would break them", () => {
  const lines = splitLines("a\n\n\nb\n\nc");
  assert.deepEqual(neighbours(lines, 3), { before: "a", after: "c" });
});
