import test from "node:test";
import assert from "node:assert/strict";
import {
  speakerSubmissionEmail,
  SPEAKER_SUBMISSION_RECIPIENTS,
} from "../../src/lib/notify/speaker-submission";

/**
 * The copy that goes to the coordinators when a speaker submits.
 *
 * Its whole job is to be readable on a phone without signing in, so
 * every answer has to actually be in the body — a notification that
 * says "somebody submitted something" would be worse than nothing.
 */

const full = () =>
  speakerSubmissionEmail({
    eventTitle: "BioHubNet Industry Insights 2026",
    slug: "2026-industry-insights",
    fullName: "Dr Amara Okonkwo",
    title: "Senior Director, Regulatory Affairs",
    organization: "Eurofins Scientific",
    bio: "Amara leads regulatory affairs at Eurofins.",
    linkedinUrl: "https://www.linkedin.com/in/amara/",
    sessionTitle: "Regulatory Strategy for Biomanufacturing Ventures",
    sessionPitch: "How to sequence filings so a financing round survives.",
    photoUrl: "https://cdn.example.com/headshots/amara.png",
  });

test("it goes to both coordinators", () => {
  assert.deepEqual([...SPEAKER_SUBMISSION_RECIPIENTS], [
    "yes.lee@utoronto.ca",
    "Ruilin.yuan@utoronto.ca",
  ]);
});

test("the speaker's name is in the subject, so an inbox is scannable", () => {
  const m = full();
  assert.ok(m.subject.includes("Dr Amara Okonkwo"));
  assert.ok(m.subject.includes("BioHubNet Industry Insights 2026"));
});

test("every answer reaches both parts of the email", () => {
  const m = full();
  for (const v of [
    "Dr Amara Okonkwo",
    "Senior Director, Regulatory Affairs",
    "Eurofins Scientific",
    "Amara leads regulatory affairs at Eurofins.",
    "https://www.linkedin.com/in/amara/",
    "Regulatory Strategy for Biomanufacturing Ventures",
    "How to sequence filings so a financing round survives.",
  ]) {
    assert.ok(m.text.includes(v), `${v} missing from the text part`);
    assert.ok(m.html.includes(v), `${v} missing from the HTML part`);
  }
});

test("the headshot is shown and linked", () => {
  const m = full();
  assert.ok(m.html.includes('src="https://cdn.example.com/headshots/amara.png"'));
  assert.ok(m.text.includes("https://cdn.example.com/headshots/amara.png"));
});

test("it links to the admin page for this event", () => {
  const m = full();
  assert.match(m.text, /\/admin\/events\/2026-industry-insights\/speakers/);
  assert.match(m.html, /\/admin\/events\/2026-industry-insights\/speakers/);
});

test("a missing answer shows as missing, not as a gap", () => {
  const m = speakerSubmissionEmail({
    eventTitle: "E", slug: "s", fullName: "Jane Doe",
    title: null, organization: null, bio: null,
    linkedinUrl: null, sessionTitle: null, sessionPitch: null, photoUrl: null,
  });
  // Six labelled rows, and the blanks are visibly blank.
  assert.ok(m.text.includes("TITLE / ROLE\n—"));
  assert.ok(m.text.includes("BIOGRAPHY\n—"));
  assert.ok(m.html.includes("—"));
  // No broken <img> when there is no photo.
  assert.ok(!m.html.includes("<img"));
});

test("nothing a speaker types can inject markup", () => {
  const m = speakerSubmissionEmail({
    eventTitle: "E", slug: "s",
    fullName: '<script>alert(1)</script>',
    title: '"><b>x</b>',
    organization: null,
    bio: "<img src=x onerror=alert(1)>",
    linkedinUrl: null, sessionTitle: null, sessionPitch: null, photoUrl: null,
  });
  assert.ok(!m.html.includes("<script>"));
  assert.ok(!m.html.includes("<b>x</b>"));
  assert.ok(!m.html.includes("<img src=x"));
  assert.ok(m.html.includes("&lt;script&gt;"));
});

test("a bio with line breaks keeps them", () => {
  const m = speakerSubmissionEmail({
    eventTitle: "E", slug: "s", fullName: "Jane Doe",
    title: null, organization: null,
    bio: "First paragraph.\n\nSecond paragraph.",
    linkedinUrl: null, sessionTitle: null, sessionPitch: null, photoUrl: null,
  });
  assert.ok(m.html.includes("white-space:pre-wrap"), "paragraphs would collapse without it");
  assert.ok(m.text.includes("First paragraph.\n\nSecond paragraph."));
});
