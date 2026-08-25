import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SpeakerIntakeForm } from "../../src/components/events/SpeakerIntakeForm";

/**
 * The bug this file exists for.
 *
 * A <label> activates its FIRST labelable descendant on any click
 * inside it. Right when it wraps one input; wrong when it wraps
 * several. The headshot field holds a file input, a canvas you drag to
 * frame the photo, and a zoom slider — so dragging the photo ended in a
 * click the label forwarded to the file input, and the picker opened
 * every time somebody tried to move their own face.
 *
 * Rendered as markup and parsed, because the defect is in the SHAPE of
 * the HTML rather than in any behaviour a unit test could call.
 */
const html = renderToStaticMarkup(React.createElement(SpeakerIntakeForm, { slug: "2026-industry-insights" }));

/** Every <label>…</label> in the output, crudely but adequately. */
function labels(markup: string): string[] {
  const out: string[] = [];
  const re = /<label\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markup))) {
    // Labels do not nest in this form, so the next </label> closes it.
    const end = markup.indexOf("</label>", m.index);
    if (end > -1) out.push(markup.slice(m.index, end));
  }
  return out;
}

const controlsIn = (s: string) => (s.match(/<(input|select|textarea|button)\b/g) ?? []).length;

test("no label wraps more than one control", () => {
  const guilty = labels(html)
    .map((l) => ({ n: controlsIn(l), text: l.replace(/<[^>]+>/g, " ").trim().slice(0, 40) }))
    .filter((x) => x.n > 1);
  assert.deepEqual(guilty, [], "a label wrapping two controls forwards clicks to the first one");
});

test("the file input is not inside the headshot field's caption", () => {
  // The exact shape of the reported bug: dragging the photo opened the
  // picker, because the drag ended in a click and the enclosing label
  // sent it to the file input.
  const withFile = labels(html).filter((l) => /type="file"/.test(l));
  assert.equal(withFile.length, 1, "the file input should sit in exactly one label — its own");
  assert.match(withFile[0], /Choose a photo/, "and that one is the picker's own button, not the field caption");
});

test("a grouped field still names its control, by id", () => {
  // Ungrouping without this trades a click bug for a control with no
  // accessible name, which is worse.
  assert.match(html, /<label[^>]*for="speaker-bio"/);
  assert.match(html, /<textarea[^>]*id="speaker-bio"/);
});

test("every control a person types into has an accessible name", () => {
  const ids = new Set([...html.matchAll(/<label[^>]*for="([^"]+)"/g)].map((m) => m[1]));
  const controls = [...html.matchAll(/<(input|select|textarea)\b([^>]*)>/g)]
    .filter((m) => !/type="(hidden|file|range|submit)"/.test(m[2]));
  assert.ok(controls.length > 5, "sanity: the form has fields");
  for (const [, , attrs] of controls) {
    const id = attrs.match(/id="([^"]+)"/)?.[1];
    const named = (id && ids.has(id)) || /aria-label=/.test(attrs);
    // The rest are wrapped by their own label, which the first test
    // has already proved wraps exactly one control.
    if (!named) {
      const name = attrs.match(/name="([^"]+)"/)?.[1] ?? "(unnamed)";
      assert.ok(html.includes(`name="${name}"`), `${name} has no way to be named`);
    }
  }
});

test("the headshot field still says what to do with it", () => {
  // The fix removes a label; it must not remove the instruction.
  assert.match(html, /Headshot/);
  assert.match(html, /Drag to frame it inside the circle/);
});
