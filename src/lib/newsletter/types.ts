/**
 * Newsletter workshop — shared vocabulary.
 *
 * The four sections mirror the programme names used everywhere else on
 * the platform, plus a per-issue events block. Colours and sub-labels
 * are lifted verbatim from the shipped Mailchimp template so a rendered
 * issue is indistinguishable from a hand-built one.
 */

export const SECTIONS = ["engage", "experience", "equip", "event"] as const;
export type Section = (typeof SECTIONS)[number];

export function isSection(s: string): s is Section {
  return (SECTIONS as readonly string[]).includes(s);
}

export interface SectionTheme {
  /** Ribbon wordmark. */
  label: string;
  /** Small type trailing the wordmark. */
  tagline: string;
  /** Solid fallback — Outlook ignores the gradient. */
  solid: string;
  /** 135deg ribbon gradient. */
  ribbon: string;
  /** Hairline / glance-card / people-org accent. */
  accent: string;
  /** Divider + glance-card label tint. */
  rule: string;
}

/** Verbatim from the June 2026 issue. Don't drift these — they're the
 *  reason a generated issue matches the hand-built ones. */
export const SECTION_THEME: Record<Section, SectionTheme> = {
  engage: {
    label: "ENGAGE",
    tagline: "Training · Development",
    solid: "#0d6054",
    ribbon: "linear-gradient(135deg, #11857d 0%, #0d6054 55%, #084237 100%)",
    accent: "#0d6054",
    rule: "#0d6054",
  },
  experience: {
    label: "EXPERIENCE",
    tagline: "Knowledge Exchange · Internships",
    solid: "#016e8f",
    ribbon: "linear-gradient(135deg, #0a8eb2 0%, #016e8f 55%, #014d65 100%)",
    accent: "#016e8f",
    rule: "#016e8f",
  },
  equip: {
    label: "EQUIP",
    tagline: "Entrepreneurship · Funding",
    solid: "#011d57",
    ribbon: "linear-gradient(135deg, #1d3d8e 0%, #011d57 55%, #000d36 100%)",
    accent: "#011d57",
    rule: "#011d57",
  },
  // The events block isn't in the June issue; plum keeps it clearly
  // distinct from the teal → blue → navy programme progression without
  // fighting it.
  event: {
    label: "EVENTS",
    tagline: "What's On",
    solid: "#5b2a6e",
    ribbon: "linear-gradient(135deg, #7d3f93 0%, #5b2a6e 55%, #3d1a4b 100%)",
    accent: "#5b2a6e",
    rule: "#5b2a6e",
  },
};

/** One "At a Glance" row. `accent: true` renders it in the alert red the
 *  template uses for deadlines. */
export interface GlanceRow {
  label: string;
  value: string;
  accent?: boolean;
}

/** A named person — awardee lists, internship matches, and so on. */
export interface PersonRow {
  name: string;
  /** Trailing grey qualifier: "PhD, Immunology" or "University of Toronto". */
  detail?: string;
  /** Accent-coloured line under the name: employer, host lab, company. */
  org?: string;
}

/** What the AI derives from a raw submission — the renderer's input. */
export interface LinkRow {
  label: string;
  url: string;
}

export interface PieceLayout {
  headline: string;
  subhead?: string;
  /** Paragraphs, already plain text. Rendered in order. */
  body: string[];
  glance?: GlanceRow[];
  people?: PersonRow[];
  /** Grouping label printed above a people list ("Long-Term Placement"). */
  peopleLabel?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  /** Several related destinations — the outlined two-across chip grid the
   *  June issue uses to list the four Biomanufacturing pathways. Distinct
   *  from the single solid CTA, which stays the piece's one main action. */
  links?: LinkRow[];
  /** Short callout rendered as a tinted card — "Coming soon" notes. */
  note?: string;
  noteBadge?: string;
}

export const EMPTY_LAYOUT: PieceLayout = { headline: "", body: [] };
