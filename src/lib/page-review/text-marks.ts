export type TextMark = { kind: "bold" | "italic"; start: number; end: number };

/** Render only supported semantic marks. Wording is always inserted as text. */
export function renderTextMarks(doc: Document, text: string, marks: TextMark[]): DocumentFragment {
  if (!marks.length || marks.length > 40 || marks.some(({ kind, start, end }) =>
    (kind !== "bold" && kind !== "italic") || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
    start < 0 || start >= end || end > text.length)) {
    throw new Error("The selected text changed or the formatting selection is invalid.");
  }
  const out = doc.createDocumentFragment();
  const edges = [...new Set([0, text.length, ...marks.flatMap(mark => [mark.start, mark.end])])].sort((a, b) => a - b);
  for (let i = 0; i < edges.length - 1; i++) {
    const start = edges[i], end = edges[i + 1];
    let piece: Node = doc.createTextNode(text.slice(start, end));
    for (const kind of ["italic", "bold"] as const) {
      if (!marks.some(mark => mark.kind === kind && mark.start <= start && mark.end >= end)) continue;
      const wrapper = doc.createElement(kind === "bold" ? "strong" : "em");
      wrapper.appendChild(piece); piece = wrapper;
    }
    out.appendChild(piece);
  }
  return out;
}
