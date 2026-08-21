/**
 * Turning a web address written in a sentence into one you can click.
 *
 * A note that says "read about all three at biohubnet.ca" and then makes
 * the reader select it, copy it and paste it into a new tab has told
 * them where to go and then made going there somebody else's problem.
 *
 * DELIBERATELY NARROW. This is not a markdown renderer: it recognises a
 * full URL and a bare domain, and nothing else. Anything richer means
 * accepting formatting from a text box that a coordinator types into,
 * and the failure mode of a half-implemented markdown parser is a
 * registrant reading raw asterisks.
 *
 * Pure module: no React, no I/O.
 */

/** A piece of a sentence: either words, or somewhere to go. */
export type Piece =
  | { text: string }
  | { text: string; href: string };

/*
 * A full URL, or a bare domain on one of the endings we actually use.
 * Not "any dotted word": "e.g. ENGAGE, EXPERIENCE or EQUIP." would turn
 * "g.ENGAGE" into a link, and a sentence that ends in a domain would
 * swallow the full stop.
 */
const PATTERN = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?]|\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:ca|com|org|net|edu|io)\b(?:\/[^\s<>()]*[^\s<>().,;:!?])?)/gi;

/**
 * Split a sentence into text and links.
 *
 * Returns the whole thing as one plain piece when there is nothing to
 * link, so a caller can render the result the same way either way.
 */
export function linkify(text: string): Piece[] {
  if (!text) return [];
  const out: Piece[] = [];
  let last = 0;
  for (const m of text.matchAll(PATTERN)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at) });
    const found = m[0];
    out.push({
      text: found,
      // A bare domain still needs a scheme, or the browser reads it as a
      // path relative to the page it is on.
      href: /^https?:\/\//i.test(found) ? found : `https://${found}`,
    });
    last = at + found.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out.length > 0 ? out : [{ text }];
}

/** True when there is at least one address in here. */
export const hasLink = (text: string) => linkify(text).some((p) => "href" in p);
