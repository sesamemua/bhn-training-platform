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

/* ── The LinkedIn field ──────────────────────────────────────────── */

import { normaliseLinkedin } from "../../src/lib/showcase/validation";

test("no button offers to open a profile for them", () => {
  // The "Open mine" shortcut was removed at the organisers' request. The
  // field alone has to carry it now, which the normaliser below does.
  assert.doesNotMatch(html, /Open mine/);
  assert.doesNotMatch(html, /linkedin\.com\/in\/me\//);
  assert.doesNotMatch(html, /takes you to your own profile/);
});

test("still nothing routed through a search engine", () => {
  // The shortcut this replaced went through a web search, which showed
  // people a bot challenge. Nothing should reintroduce one.
  assert.ok(!/duckduckgo|google\.com\/search|bing\.com/.test(html), "no search engine in the rendered form");
});

/* ── What the field will accept ──────────────────────────────────── */

test("a bare handle is enough", () => {
  assert.equal(normaliseLinkedin("jeffreyseres"), "https://www.linkedin.com/in/jeffreyseres/");
  assert.equal(normaliseLinkedin("@jeffreyseres"), "https://www.linkedin.com/in/jeffreyseres/");
});

test("regional subdomains are the same person", () => {
  assert.equal(
    normaliseLinkedin("https://ca.linkedin.com/in/jeffreyseres"),
    "https://www.linkedin.com/in/jeffreyseres/",
  );
});

test("the mobile app's share link works", () => {
  assert.equal(
    normaliseLinkedin("https://www.linkedin.com/in/jeffreyseres?utm_source=share&utm_medium=member_ios"),
    "https://www.linkedin.com/in/jeffreyseres/",
  );
  assert.equal(
    normaliseLinkedin("https://www.linkedin.com/mwlite/in/jeffreyseres"),
    "https://www.linkedin.com/in/jeffreyseres/",
  );
});

test("a URL pasted inside a sentence is still found", () => {
  assert.equal(
    normaliseLinkedin("Here you go: https://www.linkedin.com/in/jeffreyseres/ — thanks!"),
    "https://www.linkedin.com/in/jeffreyseres/",
  );
});

test("a non-Latin handle survives", () => {
  const out = normaliseLinkedin("https://www.linkedin.com/in/andré");
  assert.equal(out, `https://www.linkedin.com/in/${encodeURIComponent("andré")}/`);
});

test("somebody else's domain is not LinkedIn", () => {
  // endsWith("linkedin.com") also matches notlinkedin.com, which is a
  // domain anybody can buy.
  assert.equal(normaliseLinkedin("https://notlinkedin.com/in/jeffreyseres"), null);
  assert.equal(normaliseLinkedin("https://linkedin.com.evil.example/in/x"), null);
});

test("a non-profile LinkedIn page is refused", () => {
  assert.equal(normaliseLinkedin("https://www.linkedin.com/company/eurofins"), null);
  assert.equal(normaliseLinkedin("https://www.linkedin.com/feed/"), null);
});

test("a sentence's own full stop is not part of the handle", () => {
  // The URL finder stops at whitespace, so the full stop ending the
  // sentence gets swallowed — and "." is legal in a slug (jane.doe), so
  // it survives into the stored URL as /in/jane-doe./ and 404s. The
  // green "Reads as" line would show it as a dot that looks like the
  // sentence's own punctuation, hiding the error.
  assert.equal(
    normaliseLinkedin("Here's my profile: https://www.linkedin.com/in/jane-doe."),
    "https://www.linkedin.com/in/jane-doe/",
  );
  assert.equal(
    normaliseLinkedin("(https://www.linkedin.com/in/jane-doe)"),
    "https://www.linkedin.com/in/jane-doe/",
  );
  assert.equal(
    normaliseLinkedin("see https://www.linkedin.com/in/jane-doe..."),
    "https://www.linkedin.com/in/jane-doe/",
  );
  // ...but a dot that is genuinely in the handle stays.
  assert.equal(
    normaliseLinkedin("https://www.linkedin.com/in/jane.doe"),
    "https://www.linkedin.com/in/jane.doe/",
  );
});

test("finding the URL in text is linear, not quadratic", () => {
  // The host part must be [^\\s/]*, not \\S*. Unbounded \\S* before a
  // literal makes every "http://" a fresh start position that scans to
  // the end and backtracks: 200 KB took 3.9 s on a public endpoint, on
  // a single-threaded runtime.
  const big = "http://".repeat(30_000); // ~200 KB
  const t0 = process.hrtime.bigint();
  normaliseLinkedin(big);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 100, `took ${ms.toFixed(0)}ms — the finder has gone quadratic again`);
});

test("a handle of pure punctuation is not a profile", () => {
  // ".." passes a character class that allows dots and becomes
  // linkedin.com/in/../ — a URL resolving to LinkedIn's front page,
  // stored as though it were somebody's profile.
  assert.equal(normaliseLinkedin(".."), null);
  assert.equal(normaliseLinkedin("..."), null);
  assert.equal(normaliseLinkedin("---"), null);
  assert.equal(normaliseLinkedin("_._"), null);
  // ...but a real handle containing dots is still fine.
  assert.equal(normaliseLinkedin("jane.doe"), "https://www.linkedin.com/in/jane.doe/");
});

test("empty and nonsense give null, not a broken URL", () => {
  assert.equal(normaliseLinkedin(""), null);
  assert.equal(normaliseLinkedin("   "), null);
  assert.equal(normaliseLinkedin("https://example.com/in/foo"), null);
});

/* ─── The limit the form tells people about ──────────────────────── */

test("the form states the limit in words, not characters", () => {
  const html = renderToStaticMarkup(
    React.createElement(SpeakerIntakeForm, { slug: "e", eventTitle: "E" } as never),
  );
  assert.match(html, /Up to 250 words/, "the hint should name the word limit");
  assert.match(html, /0 \/ 250 words/, "the counter should count words");
  assert.doesNotMatch(html, /250 characters/, "no character limit should survive anywhere in the form");
});

test("shortening is not offered to a bio that is inside the limit", () => {
  const html = renderToStaticMarkup(
    React.createElement(SpeakerIntakeForm, { slug: "e", eventTitle: "E" } as never),
  );
  // An empty bio is inside the limit, so the button starts disabled —
  // it exists for the speaker who pastes a faculty page, not for
  // everyone who fills the form in.
  assert.match(html, /Shorten for me/);
  const btn = html.slice(0, html.indexOf("Shorten for me"));
  assert.ok(btn.lastIndexOf("disabled") > btn.lastIndexOf("<button"), "the button should start disabled");
});
