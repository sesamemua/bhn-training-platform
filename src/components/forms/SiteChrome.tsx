/**
 * The biohubnet.ca page around a public form drawn in the site theme:
 * the fixed header, the photo hero, the form's blue-glass section and the
 * dark footer, laid out as https://biohubnet.ca/2026-annual-symposium/ is.
 *
 * Server components, with no client boundary at all. The one thing that
 * changes after first paint — the header going from glass over the photo
 * to white over the form — is a scroll-driven animation in site-theme.css
 * whose resting state is the white header. A browser that cannot run it
 * gets the site's scrolled header from the start, which reads on the
 * photo and on the form alike; a scroll listener that failed to load
 * would have left a white logo on a white page.
 *
 * Every class here is styled in site-theme.css under .bhn-site, and
 * tests/unit/site-theme.test.ts fails if one side is renamed without the
 * other.
 */
/* eslint-disable @next/next/no-img-element -- the white lockup is the
   site's own file, hotlinked so it cannot drift, and next/image would
   re-encode both lockups; the hero photo is art-directed by CSS. */
import type { ReactNode } from "react";
import { RichText } from "@/components/forms/RichText";
import { FORM_COLUMN } from "@/lib/formbuilder/layout";
import type { Presentation } from "@/lib/formbuilder/types";

/** The form's section id: the header CTA, the skip link and "#registration" actions land here. */
export const REGISTRATION_ANCHOR = "registration";

/*
 * The BioHubNet lockups, used exactly as published — never cropped,
 * recoloured or redrawn. The colour one is the official PNG in public/
 * (public/biohubnet-logo.svg is a reconstruction and is not used); the
 * white one is biohubnet.ca's own, the file its header and footer load.
 */
export const LOGO_COLOUR = { src: "/biohubnet-logo.png", width: 2357, height: 619 } as const;
export const LOGO_WHITE = {
  src: "https://biohubnet.ca/wp-content/uploads/2025/02/BHN-LOGO-20250203-WHITE.png",
  width: 6329,
  height: 1661,
} as const;

/** The symposium hero's photograph (its recap-f.jpg), resized to 1920 wide. */
export const HERO_PHOTO = { src: "/apply/site/symposium-hero.jpg", width: 1920, height: 1283 } as const;

const SITE_HOME = "https://biohubnet.ca/";

/**
 * Off-page links open beside the form, as RichText's do: a click on the
 * logo should not cost somebody the answers they have typed so far.
 */
function linkProps(href: string) {
  return href.startsWith("#") ? {} : { target: "_blank", rel: "noopener noreferrer" };
}

/* ───── Header ───── */

export function SiteHeader({ homeLink }: { homeLink?: Presentation["homeLink"] }) {
  return (
    <>
      {/* The first thing a keyboard reaches: past the header and the hero. */}
      <a href={`#${REGISTRATION_ANCHOR}`} className="bhn-skip">Skip to the form</a>
      <header className="bhn-header">
        <div className="bhn-header-bar">
          <a href={SITE_HOME} className="bhn-brand" {...linkProps(SITE_HOME)}>
            {/* Both lockups are drawn and cross-faded, as the site does it:
                swapping one src for the other would flash an empty box. */}
            <img
              className="bhn-logo bhn-logo--white"
              src={LOGO_WHITE.src}
              width={LOGO_WHITE.width}
              height={LOGO_WHITE.height}
              alt="BioHubNet"
              decoding="async"
            />
            <img
              className="bhn-logo bhn-logo--colour"
              src={LOGO_COLOUR.src}
              width={LOGO_COLOUR.width}
              height={LOGO_COLOUR.height}
              alt=""
              aria-hidden="true"
              decoding="async"
            />
          </a>
          <nav className="bhn-nav" aria-label="Primary navigation">
            {homeLink && (
              <a href={homeLink.href} className="bhn-nav-link" {...linkProps(homeLink.href)}>
                {homeLink.label}
              </a>
            )}
            <a href={`#${REGISTRATION_ANCHOR}`} className="bhn-cta">Register now</a>
          </nav>
        </div>
      </header>
    </>
  );
}

/* ───── Hero ───── */

export function SiteHero({
  heading,
  subheading,
  intro,
  description,
  actions,
  facts,
}: {
  heading: string;
  subheading?: string;
  /** Paragraphs in RichText syntax. */
  intro?: string[];
  /**
   * Plain text, said only when there is neither an intro nor facts. The
   * description is a one-line summary for search results and link cards;
   * beside a fact panel it only repeats the panel, and on a phone it
   * pushed the form a whole screen further down.
   */
  description?: string | null;
  actions?: Presentation["actions"];
  facts?: Presentation["facts"];
}) {
  const hasFacts = Boolean(facts?.length);
  return (
    <section className={hasFacts ? "bhn-hero bhn-hero--facts" : "bhn-hero"} aria-labelledby="bhn-hero-title">
      <div className="bhn-hero-media" aria-hidden="true">
        <img
          src={HERO_PHOTO.src}
          width={HERO_PHOTO.width}
          height={HERO_PHOTO.height}
          alt=""
          fetchPriority="high"
          decoding="async"
        />
      </div>
      <div className="bhn-hero-content">
        <div className="bhn-hero-copy">
          <h1 id="bhn-hero-title">{heading}</h1>
          {subheading && <p className="bhn-lede">{subheading}</p>}
          {intro?.length ? (
            <div className="bhn-hero-intro">
              {intro.map((p, i) => <p key={i}><RichText text={p} /></p>)}
            </div>
          ) : description && !hasFacts ? (
            <div className="bhn-hero-intro"><p>{description}</p></div>
          ) : null}
          {actions?.length ? (
            <div className="bhn-hero-actions">
              {actions.map((action, i) => (
                // The first is the solid one, like the site's REGISTER NOW.
                <a
                  key={i}
                  href={action.href}
                  className={i === 0 ? "bhn-button bhn-button--solid" : "bhn-button"}
                  {...linkProps(action.href)}
                >
                  {action.label}
                </a>
              ))}
            </div>
          ) : null}
        </div>
        {hasFacts && (
          <dl className="bhn-hero-facts">
            {facts!.map((fact, i) => (
              <div key={i} className="bhn-hero-fact">
                <dt>{fact.label}</dt>
                <dd><RichText text={fact.text} /></dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}

/* ───── The form's section ───── */

export function SiteFormSection({ label, intro, column = FORM_COLUMN, children }: {
  label: string; intro?: string;
  /** The column the form inside asked for — a calendar needs the wider one. */
  column?: string;
  children: ReactNode;
}) {
  return (
    <section id={REGISTRATION_ANCHOR} className="bhn-form-section" aria-label={label}>
      <div className="bhn-form-shell">
        <div className={`${column} bhn-form-column`}>
          {intro && <p className="bhn-form-intro"><RichText text={intro} /></p>}
          {children}
        </div>
      </div>
    </section>
  );
}

/* ───── Footer ───── */

/*
 * biohubnet.ca's <biohubnet-site-footer>, word for word from the
 * component's own source (biohubnet-site-footer.js), minus the newsletter
 * form: a second form under this one, posting somewhere else, is not
 * something to put at the end of a registration.
 */
const FOOTER_COLUMNS: { title: string; label: string; links: [text: string, href: string][] }[] = [
  {
    title: "Explore",
    label: "Site links",
    links: [
      ["Home", "https://biohubnet.ca/"],
      ["News", "https://biohubnet.ca/news/"],
      ["About", "https://biohubnet.ca/about-us/"],
      ["Contact", "https://biohubnet.ca/contact/"],
    ],
  },
  {
    title: "Programs",
    label: "Programs",
    links: [
      ["ENGAGE", "https://biohubnet.ca/engage/"],
      ["EXPERIENCE", "https://biohubnet.ca/experience/"],
      ["EQUIP", "https://biohubnet.ca/equip/"],
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="bhn-footer">
      <div className="bhn-footer-shell">
        <div className="bhn-footer-grid">
          <section aria-label="BioHubNet address">
            <img
              className="bhn-footer-logo"
              src={LOGO_WHITE.src}
              width={LOGO_WHITE.width}
              height={LOGO_WHITE.height}
              alt="BioHubNet Transformative Talent Development"
              loading="lazy"
              decoding="async"
            />
            <p className="bhn-footer-address">
              Biomanufacturing Hub Network<br />
              Leslie Dan Faculty of Pharmacy<br />
              University of Toronto<br />
              144 College Street, Toronto, Ontario, Canada M5S 3M2
            </p>
            <p className="bhn-footer-funding">
              BioHubNet is funded by the Government of Canada through the{" "}
              <a
                href="https://sshrc-crsh.canada.ca/funding-financement/cbrf-frbc/infographic-EN-FR.pdf"
                target="_blank"
                rel="noopener noreferrer"
              >
                CBRF
              </a>
              .
            </p>
          </section>
          <nav className="bhn-footer-nav" aria-label="Footer navigation">
            {FOOTER_COLUMNS.map((column) => (
              <section key={column.title} aria-label={column.label}>
                <span className="bhn-footer-eyebrow">{column.title}</span>
                <div className="bhn-footer-links">
                  {column.links.map(([text, href]) => (
                    <a key={href} href={href} target="_blank" rel="noopener noreferrer">{text}</a>
                  ))}
                </div>
              </section>
            ))}
          </nav>
        </div>
        <div className="bhn-footer-lower">
          <span>Copyright 2026 BioHubNet. All rights reserved.</span>
          <a
            className="bhn-footer-social"
            href="https://www.linkedin.com/company/BioHubNet"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Visit BioHubNet on LinkedIn"
          >
            <span>Connect</span>
            <span className="bhn-footer-in" aria-hidden="true">in</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
