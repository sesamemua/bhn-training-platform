/** Shared by browser and server. Ordinals refer only to original, meaningful text nodes. */
export function editableTextNodes(doc: Document): Text[] {
  const walker = doc.createTreeWalker(doc.body, 4);
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text, parent = node.parentElement;
    if (!parent || !node.data.trim() || !parent.closest("h1,h2,h3,h4,h5,h6,p,a,span,td,th,li,blockquote,figcaption")) continue;
    if (parent.closest("script,style,noscript,textarea,select,button,svg,[hidden],[aria-hidden=true],#bhn-review-overlay,.bhn-review-marker,.bhn-report-inline-comment,[data-bhn-review-ui]")) continue;
    nodes.push(node);
  }
  return nodes;
}
