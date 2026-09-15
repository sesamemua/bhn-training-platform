import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import {
  HERO_PHOTO, LOGO_COLOUR, LOGO_WHITE, REGISTRATION_ANCHOR, SiteFooter, SiteFormSection, SiteHeader, SiteHero,
} from "../../src/components/forms/SiteChrome";
import { FORM_COLUMN } from "../../src/lib/formbuilder/layout";
import { parseForm, type Presentation } from "../../src/lib/formbuilder/types";

/**
 * The biohubnet.ca page around a site-themed form: what each piece says,
 * where it points, and that the logo is the official lockup. How it LOOKS
 * is site-theme.css, checked in tests/unit/site-theme.test.ts.
 */

const root = (path: string) => join(process.cwd(), path);
const LUMA = "https://luma.com/wh30nh1n";
const WHITE_LOGO = "https://biohubnet.ca/wp-content/uploads/2025/02/BHN-LOGO-20250203-WHITE.png";

const LOOK: Presentation = {
  theme: "site",
  heading: "BioHubNet Training Week",
  subheading: "26–28 October 2026 | Toronto",
  facts: [
    { label: "Who can register", text: "HQPs accepted into **ENGAGE**, EXPERIENCE or EQUIP." },
    { label: "Seat offers", text: "By email, during the last week of September." },
    { label: "Annual Symposium", text: `A separate event.\nRegister on [BioHubNet 2026 Annual Symposium · Luma](${LUMA}).` },
  ],
  actions: [
    { label: "Start registration", href: "#registration" },
    { label: "Symposium registration", href: LUMA },
  ],
  formIntro: "Questions marked * are required.",
  homeLink: { label: "2026 Symposium", href: "https://biohubnet.ca/2026-annual-symposium/" },
};

/**
 * Markup as the page body gets it. React hoists <link rel="preload"> for
 * the images above the fold into <head> on a real render; a bare
 * renderToStaticMarkup puts them in front of the markup instead.
 */
const markup = (node: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(node).replace(/^(?:<link rel="preload"[^>]*\/>)+/, "");

const hero = (props: Partial<Parameters<typeof SiteHero>[0]> = {}) =>
  markup(
    <SiteHero
      heading={LOOK.heading!}
      subheading={LOOK.subheading}
      actions={LOOK.actions}
      facts={LOOK.facts}
      {...props}
    />,
  );

test("the chrome's fields survive parseForm, and a javascript: button is not a presentation at all", () => {
  assert.deepEqual(parseForm({ fields: [], presentation: LOOK }).presentation, LOOK);
  // Dropped whole, like any malformed presentation — so no href the chrome
  // draws can be anything but an in-page anchor or an https address.
  const bad = { theme: "site", actions: [{ label: "Go", href: "javascript:alert(1)" }] };
  assert.equal(parseForm({ fields: [], presentation: bad }).presentation, undefined);
  assert.equal(parseForm({ fields: [], presentation: { theme: "site", homeLink: { label: "x", href: "http://biohubnet.ca" } } }).presentation, undefined);
});

/* ───── Header ───── */

test("header: the official lockups — white over the photo, colour once scrolled — linking home", () => {
  const html = markup(<SiteHeader homeLink={LOOK.homeLink} />);
  assert.match(
    html,
    /<a href="https:\/\/biohubnet\.ca\/" class="bhn-brand" target="_blank" rel="noopener noreferrer"><img class="bhn-logo bhn-logo--white" src="https:\/\/biohubnet\.ca\/wp-content\/uploads\/2025\/02\/BHN-LOGO-20250203-WHITE\.png" width="6329" height="1661" alt="BioHubNet"/,
  );
  // The second is the same name drawn again, so it is not read twice.
  assert.match(html, /<img class="bhn-logo bhn-logo--colour" src="\/biohubnet-logo\.png" width="2357" height="619" alt="" aria-hidden="true"/);
  assert.doesNotMatch(html, /biohubnet-logo\.svg/);
  assert.equal(LOGO_WHITE.src, WHITE_LOGO);
});

test("header: the lockup sizes are the files' own, and the two agree on shape", () => {
  const png = readFileSync(root("public/biohubnet-logo.png"));
  assert.deepEqual({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }, { width: LOGO_COLOUR.width, height: LOGO_COLOUR.height });
  const ratio = (l: { width: number; height: number }) => l.width / l.height;
  // CSS holds the box at 2357/619 and draws both in it with object-fit: contain.
  assert.ok(Math.abs(ratio(LOGO_WHITE) / ratio(LOGO_COLOUR) - 1) < 0.002, "the white file is the same lockup");
  assert.match(readFileSync(root("src/app/apply/[slug]/site-theme.css"), "utf8"), /aspect-ratio: 2357 \/ 619;/);
});

test("header: a skip link comes first, and it and the CTA land on the form in the same tab", () => {
  const html = markup(<SiteHeader />);
  assert.equal(REGISTRATION_ANCHOR, "registration");
  assert.match(html, /^<a href="#registration" class="bhn-skip">Skip to the form<\/a><header class="bhn-header">/);
  assert.match(html, /<nav class="bhn-nav" aria-label="Primary navigation"><a href="#registration" class="bhn-cta">Register now<\/a><\/nav>/);
});

test("header: homeLink is a nav link when there is one, and nothing when there is not", () => {
  const withLink = markup(<SiteHeader homeLink={LOOK.homeLink} />);
  assert.match(
    withLink,
    /<a href="https:\/\/biohubnet\.ca\/2026-annual-symposium\/" class="bhn-nav-link" target="_blank" rel="noopener noreferrer">2026 Symposium<\/a><a href="#registration" class="bhn-cta">/,
  );
  assert.doesNotMatch(markup(<SiteHeader />), /bhn-nav-link/);
});

/* ───── Hero ───── */

test("hero: the photo, the heading, the lede, the facts as a list and two buttons with the first solid", () => {
  const html = hero();
  assert.match(html, /^<section class="bhn-hero bhn-hero--facts" aria-labelledby="bhn-hero-title">/);
  assert.match(
    html,
    /<div class="bhn-hero-media" aria-hidden="true"><img src="\/apply\/site\/symposium-hero\.jpg" width="1920" height="1283" alt="" fetchPriority="high" decoding="async"\/><\/div>/,
  );
  assert.match(html, /<h1 id="bhn-hero-title">BioHubNet Training Week<\/h1><p class="bhn-lede">26–28 October 2026 \| Toronto<\/p>/);

  assert.match(html, /<div class="bhn-hero-actions"><a href="#registration" class="bhn-button bhn-button--solid">Start registration<\/a>/);
  assert.match(html, /<a href="https:\/\/luma\.com\/wh30nh1n" class="bhn-button" target="_blank" rel="noopener noreferrer">Symposium registration<\/a><\/div>/);

  const facts = /<dl class="bhn-hero-facts">([\s\S]*)<\/dl>/.exec(html)?.[1] ?? "";
  assert.deepEqual([...facts.matchAll(/<dt>([^<]*)<\/dt>/g)].map((m) => m[1]), ["Who can register", "Seat offers", "Annual Symposium"]);
  assert.match(facts, /<dd><span class="block"><span>HQPs accepted into <\/span><strong class="font-semibold text-fg">ENGAGE<\/strong>/);
  assert.match(facts, /<span class="block mt-2">[^]*<a href="https:\/\/luma\.com\/wh30nh1n" target="_blank" rel="noopener noreferrer"[^>]*>BioHubNet 2026 Annual Symposium · Luma<\/a>/);
  assert.doesNotMatch(html, /bhn-hero-intro/, "no intro given, none drawn");
});

test("hero: without facts or actions it is one column of words — no empty panel, no empty button row", () => {
  const intro = ["Training Week events are open to accepted HQPs.", `The Symposium is separate: [Luma](${LUMA})`];
  const html = hero({ facts: undefined, actions: [], intro });
  assert.match(html, /^<section class="bhn-hero" aria-labelledby="bhn-hero-title">/);
  assert.doesNotMatch(html, /<dl|bhn-hero-actions|bhn-hero--facts/);
  assert.match(
    html,
    /<div class="bhn-hero-intro"><p><span class="block"><span>Training Week events are open to accepted HQPs\.<\/span><\/span><\/p><p><span class="block">[^]*<a href="https:\/\/luma\.com\/wh30nh1n"[^>]*>Luma<\/a>/,
  );
  // An empty facts list is no facts.
  assert.doesNotMatch(hero({ facts: [] }), /<dl|bhn-hero--facts/);
});

test("hero: the description stands in for a missing intro, as plain text, and nothing stands in for neither", () => {
  const withDescription = hero({ facts: undefined, description: "Register for [sessions](https://x.ca)." });
  assert.match(withDescription, /<div class="bhn-hero-intro"><p>Register for \[sessions\]\(https:\/\/x\.ca\)\.<\/p><\/div>/);
  // The intro wins when both are there: two summaries is one too many.
  assert.doesNotMatch(hero({ intro: ["Intro."], description: "Description." }), /Description\./);
  // So do facts: the one-line meta summary would only repeat the panel beside it.
  assert.doesNotMatch(hero({ description: "Description." }), /Description\.|bhn-hero-intro/);
  assert.doesNotMatch(hero({ description: null }), /bhn-hero-intro/);
  assert.doesNotMatch(hero({ subheading: undefined }), /bhn-lede/);
});

/* ───── Form section ───── */

test("form section: the #registration target, the intro line above the questions, in the shared column", () => {
  const html = markup(
    <SiteFormSection label="Training Week 2026 registration" intro={LOOK.formIntro}>
      <div id="form-root" />
    </SiteFormSection>,
  );
  assert.equal(
    html,
    `<section id="registration" class="bhn-form-section" aria-label="Training Week 2026 registration"><div class="bhn-form-shell">` +
      `<div class="${FORM_COLUMN} bhn-form-column"><p class="bhn-form-intro"><span class="block"><span>Questions marked * are required.</span></span></p>` +
      `<div id="form-root"></div></div></div></section>`,
  );
  const bare = markup(<SiteFormSection label="T"><div id="form-root" /></SiteFormSection>);
  assert.doesNotMatch(bare, /bhn-form-intro/);
});

/* ───── Footer ───── */

test("footer: only what biohubnet.ca's own footer says, under the white lockup", () => {
  const html = markup(<SiteFooter />);
  assert.match(html, new RegExp(`<img class="bhn-footer-logo" src="${WHITE_LOGO.replace(/[./]/g, "\\$&")}"`));
  assert.doesNotMatch(html, /biohubnet-logo\.(png|svg)/, "no colour lockup on the dark");
  assert.match(
    html,
    /<p class="bhn-footer-address">Biomanufacturing Hub Network<br\/>Leslie Dan Faculty of Pharmacy<br\/>University of Toronto<br\/>144 College Street, Toronto, Ontario, Canada M5S 3M2<\/p>/,
  );
  assert.match(
    html,
    /<p class="bhn-footer-funding">BioHubNet is funded by the Government of Canada through the <a href="https:\/\/sshrc-crsh\.canada\.ca\/funding-financement\/cbrf-frbc\/infographic-EN-FR\.pdf" target="_blank" rel="noopener noreferrer">CBRF<\/a>\.<\/p>/,
  );
  assert.match(html, /<span>Copyright 2026 BioHubNet\. All rights reserved\.<\/span>/);
  const links = [...html.matchAll(/<a href="([^"]+)" target="_blank" rel="noopener noreferrer">(Home|News|About|Contact|ENGAGE|EXPERIENCE|EQUIP)<\/a>/g)];
  assert.deepEqual(links.map((m) => m[2]), ["Home", "News", "About", "Contact", "ENGAGE", "EXPERIENCE", "EQUIP"]);
  for (const [, href] of links) assert.match(href, /^https:\/\/biohubnet\.ca\//);
  assert.doesNotMatch(html, /<form|<input/, "no newsletter form under a registration form");
});

/* ───── Assets and source ───── */

/** A JPEG's pixel size, from its start-of-frame segment. */
function jpegSize(buf: Buffer) {
  for (let i = 2; i + 9 < buf.length; ) {
    if (buf[i] !== 0xff) { i += 1; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error("no frame header");
}

test("the hero photo is in public/, at the size the markup says, and light enough to lead the page", () => {
  const path = root(`public${HERO_PHOTO.src}`);
  assert.deepEqual(jpegSize(readFileSync(path)), { width: HERO_PHOTO.width, height: HERO_PHOTO.height });
  assert.ok(statSync(path).size < 300_000, `${statSync(path).size} bytes`);
});

test("SiteChrome is server-only and never points at the reconstructed logo", () => {
  const source = readFileSync(root("src/components/forms/SiteChrome.tsx"), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.doesNotMatch(code, /["']use client["']/);
  assert.doesNotMatch(code, /biohubnet-logo\.svg/);
});
