/** Each persisted line-break span counts as one editable text slot, not one slot per line. */
export function editableTextNodes(doc: Document | Element): (Text | HTMLSpanElement)[] {
  const root = doc.nodeType === 9 ? (doc as Document).body : doc;
  const owner = root.ownerDocument!;
  const walker = owner.createTreeWalker(root, 5);
  const nodes: (Text | HTMLSpanElement)[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text | HTMLSpanElement;
    const parent = node.nodeType === 3 ? node.parentElement : node as HTMLSpanElement;
    if (!parent) continue;
    if (node.nodeType === 3) {
      if (!(node as Text).data.trim() || parent.closest("span[data-bhn-rv-text-lines]") || !parent.closest("h1,h2,h3,h4,h5,h6,p,a,span,td,th,li,blockquote,figcaption")) continue;
    } else if (!parent.matches("span[data-bhn-rv-text-lines]") ||
      Array.from(parent.childNodes).some(child => child.nodeType !== 3 && (child as Element).tagName !== "BR")) continue;
    if (parent.closest("script,style,noscript,textarea,select,button,svg,[hidden],[aria-hidden=true],#bhn-review-overlay,.bhn-review-marker,.bhn-report-inline-comment,[data-bhn-review-ui]")) continue;
    nodes.push(node);
  }
  return nodes;
}

export function reviewTextValue(node: Text | HTMLSpanElement): string {
  return node.nodeType === 3 ? (node as Text).data : Array.from(node.childNodes, child =>
    (child as Element).tagName === "BR" ? "\n" : child.textContent ?? "").join("");
}

export interface EditableTextPart { index: number | null; before: string }
export interface PlannedTextEdit { index: number; before: string; after: string }

/**
 * Plan a whole paragraph/list-item edit without flattening its inline markup.
 * Null-index parts preserve whitespace or other non-editable text exactly.
 * Unchanged, unique text parts act as anchors; each changed gap must belong
 * to one original text node. Ambiguous moves/boundaries fail before any DOM
 * mutation. Self-contained because the isolated reviewer embeds this helper.
 */
export function planTextBlockEdits(parts: EditableTextPart[], after: string): PlannedTextEdit[] {
  const fail = () => { throw new Error("This change crosses a link or formatting boundary. Keep linked or emphasized phrases intact, or edit one phrase at a time. Your text has not been saved or discarded."); };
  const before = parts.map(part => part.before).join("");
  if (before === after) return [];
  if (before.length > 30000 || after.length > 30000 || parts.length > 1000) {
    throw new Error("This text block is too large. Edit a smaller paragraph or list item.");
  }
  let offset = 0;
  const seen = new Set<number>();
  const ranges = parts.map(part => {
    if (part.index !== null) {
      if (!Number.isSafeInteger(part.index) || part.index < 0 || seen.has(part.index)) fail();
      seen.add(part.index);
    }
    const range = { ...part, start: offset, end: offset + part.before.length };
    offset = range.end;
    return range;
  });
  const anchors: { start: number; end: number; nextStart: number; nextEnd: number }[] = [];
  for (const part of ranges) {
    if (!part.before) continue;
    const at = after.indexOf(part.before);
    if (at < 0 || after.indexOf(part.before, at + 1) !== -1 || before.indexOf(part.before) !== part.start || before.indexOf(part.before, part.start + 1) !== -1) continue;
    if (anchors.length && at < anchors[anchors.length - 1].nextEnd) fail();
    anchors.push({ start: part.start, end: part.end, nextStart: at, nextEnd: at + part.before.length });
  }
  const changes = new Map<number, { start: number; end: number; text: string }[]>();
  function gap(start: number, end: number, nextStart: number, nextEnd: number) {
    while (start < end && nextStart < nextEnd && before[start] === after[nextStart]) { start++; nextStart++; }
    while (start < end && nextStart < nextEnd && before[end - 1] === after[nextEnd - 1]) { end--; nextEnd--; }
    if (start === end && nextStart === nextEnd) return;
    const candidates = ranges.filter(part => part.before.length && (start < end
      ? part.start <= start && part.end >= end
      : part.start < start && part.end > start || start === 0 && part.start === 0 || start === before.length && part.end === before.length));
    const replacement = after.slice(nextStart, nextEnd);
    // A bare break at the exact edge of a link or emphasis doesn't move any wording.
    const edge = start === end && /^\n+$/.test(replacement)
      ? ranges.find(part => part.end === start && part.index !== null) ?? ranges.find(part => part.start === start && part.index !== null)
      : undefined;
    const part = candidates.length === 1 && candidates[0].index !== null ? candidates[0] : edge;
    if (!part || part.index === null) return fail();
    const edits = changes.get(part.index) || [];
    edits.push({ start: start - part.start, end: end - part.start, text: replacement });
    changes.set(part.index, edits);
  }
  let start = 0, nextStart = 0;
  for (const anchor of anchors) {
    gap(start, anchor.start, nextStart, anchor.nextStart);
    start = anchor.end; nextStart = anchor.nextEnd;
  }
  gap(start, before.length, nextStart, after.length);
  const planned: PlannedTextEdit[] = [];
  const assembled = ranges.map(part => {
    let value = part.before;
    const edits = part.index === null ? undefined : changes.get(part.index);
    for (const edit of [...(edits || [])].sort((a, b) => b.start - a.start)) value = value.slice(0, edit.start) + edit.text + value.slice(edit.end);
    if (part.index !== null && value !== part.before) planned.push({ index: part.index, before: part.before, after: value });
    return value;
  }).join("");
  if (assembled !== after) return fail();
  return planned;
}
