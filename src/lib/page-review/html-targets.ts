export interface HtmlReviewAnchor {
  anchorKey?: string | null;
  anchorQuote?: string | null;
  anchorBlock?: string | null;
}

/** Self-contained so the same adapter can run inside the isolated HTML reviewer. */
export function createHtmlReviewTargets(doc: Document) {
  const selector = "h1,h2,h3,h4,h5,h6,p,a,button,li,blockquote,figcaption,img,div[data-nl-part]";
  const blocks = "h1,h2,h3,h4,h5,h6,p,blockquote,figcaption,div[data-nl-part]";
  const clean = (value: string | null | undefined) => (value || "").replace(/\s+/g, " ").trim();
  const text = (node: Element) => clean(node.tagName === "IMG" ? node.getAttribute("alt") : node.textContent).slice(0, 600);
  const content = (node: Element) => !node.closest("#bhn-review-overlay,.bhn-review-marker,.bhn-report-inline-comment,dialog,[data-bhn-review-ui]");
  function pick(node: Element) {
    // Formatting and inline links belong to the surrounding prose. Images
    // remain independent targets even when wrapped in a linked paragraph.
    const nearest = node.closest(selector);
    const target = nearest?.tagName === "IMG" || nearest?.tagName === "BUTTON" ? nearest
      : node.closest("li") || node.closest(blocks) || nearest;
    return target && content(target) ? target : null;
  }
  function context(node: Element) {
    const headings = Array.from(doc.querySelectorAll("h1,h2,h3,h4,h5,h6")).filter(content);
    return text(headings.filter(h => h === node || !!(h.compareDocumentPosition(node) & 4)).at(-1) || node).slice(0, 200);
  }
  function capture(node: Element) {
    node = pick(node) || node;
    const part = node.closest("[data-nl-piece]");
    const identity: Record<string, string> = { tag: node.tagName };
    if (part) {
      identity.piece = part.getAttribute("data-nl-piece") || "";
      identity.part = part.getAttribute("data-nl-part") || "";
      const image = node.closest("[data-nl-image]") || part;
      if (image.hasAttribute("data-nl-image")) identity.image = image.getAttribute("data-nl-image")!;
    } else if (node.id) identity.id = node.id;
    // Paths and link URLs alone are not identities: CTAs and DOM positions repeat.
    const key = "bhn-html:" + JSON.stringify(identity);
    return { anchorKey: key.length <= 300 ? key : 'bhn-html:{"tag":"' + node.tagName + '"}',
      anchorQuote: text(node) || null, anchorBlock: context(node) || null, anchorPath: null };
  }
  function find(anchor: HtmlReviewAnchor) {
    let identity: Record<string, string>;
    try {
      if (!anchor.anchorKey?.startsWith("bhn-html:")) return null;
      identity = JSON.parse(anchor.anchorKey.slice(9));
      if (!/^(H[1-6]|P|A|BUTTON|LI|BLOCKQUOTE|FIGCAPTION|IMG|DIV)$/.test(identity.tag)) return null;
    } catch { return null; }
    let nodes = Array.from(doc.querySelectorAll(selector)).filter(n => content(n) && n.tagName === identity.tag);
    if (identity.piece) nodes = nodes.filter(n => {
      const part = n.closest("[data-nl-piece]");
      const image = n.closest("[data-nl-image]") || part;
      return part?.getAttribute("data-nl-piece") === identity.piece &&
        part.getAttribute("data-nl-part") === identity.part &&
        (!identity.image || image?.getAttribute("data-nl-image") === identity.image);
    });
    else if (identity.id) nodes = nodes.filter(n => n.id === identity.id);
    else nodes = nodes.filter(n => context(n) === anchor.anchorBlock);
    const matches = nodes.filter(n => !!anchor.anchorQuote && text(n) === anchor.anchorQuote);
    // An image with neither alt text nor a stable image ID cannot be relocated safely.
    if (matches.length === 1) return pick(matches[0]);
    if (!matches.length && nodes.length === 1 &&
      (identity.id || identity.image || (identity.piece && identity.part && !anchor.anchorQuote))) return pick(nodes[0]);
    return null;
  }
  function findLegacy(anchor: HtmlReviewAnchor & { anchorPath?: string | null }, sameRound: boolean) {
    if (!anchor.anchorQuote) return null;
    if (sameRound && anchor.anchorPath) {
      try {
        const matches = Array.from(doc.querySelectorAll(anchor.anchorPath)).filter(n => content(n) && text(n) === anchor.anchorQuote);
        if (matches.length === 1) return pick(matches[0]);
      } catch { /* Old selectors can refer to removed markup. */ }
    }
    const matches = Array.from(doc.querySelectorAll(selector)).filter(n => content(n) && text(n) === anchor.anchorQuote);
    const leaves = matches.filter(n => !matches.some(other => n !== other && n.contains(other)));
    return leaves.length === 1 ? pick(leaves[0]) : null;
  }
  return { pick, capture, find, findLegacy };
}
