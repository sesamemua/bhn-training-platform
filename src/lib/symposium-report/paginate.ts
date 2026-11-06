export type Block = { kind: "paragraph" | "heading" | "note"; text: string; start: number; continued?: boolean };

const markers = { paragraph: "", heading: "## ", note: "> " };

export function reportBlocks(text: string): Block[] {
  let cursor = 0;
  return text.split(/\n\s*\n/).flatMap((paragraph): Block[] => {
    const value = paragraph.trim();
    if (!value) return [];
    const offset = text.indexOf(value, cursor);
    cursor = offset + value.length;
    const kind = value.startsWith(markers.heading) ? "heading" : value.startsWith(markers.note) ? "note" : "paragraph";
    const marker = markers[kind].length;
    return [{ kind, text: value.slice(marker), start: offset + marker }];
  });
}

export function replaceReportBlock(source: string, block: Block, text: string) {
  const end = block.start + block.text.length;
  if (source.slice(block.start, end) !== block.text) return source;
  const start = !text.trim() && !block.continued ? block.start - markers[block.kind].length : block.start;
  return source.slice(0, start) + text + source.slice(end);
}

export function paginate(blocks: Block[], minimum: number, fits: (blocks: Block[], index: number) => boolean) {
  const frames: Block[][] = [[]];
  const current = () => frames.at(-1)!;
  const room = (block: Block) => fits([...current(), block], frames.length - 1);
  for (const [index, original] of blocks.entries()) {
    const next = blocks[index + 1];
    if (original.kind === "heading" && next && current().length &&
      !fits([...current(), original, { ...next, text: Array.from(next.text).slice(0, 35).join("") }], frames.length - 1)) {
      frames.push([]);
    }

    let block = original;
    while (!room(block)) {
      const letters = Array.from(block.text);
      let low = 0, high = letters.length - 1;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (room({ ...block, text: letters.slice(0, mid).join("") })) low = mid;
        else high = mid - 1;
      }
      if (low === 0 || (current().length && low < Math.min(50, letters.length))) {
        if (!current().length && frames.length > 1) throw new Error("A single character cannot fit in a report frame.");
        frames.push([]);
        continue;
      }
      let cut = low;
      for (let i = low - 1; i >= Math.max(0, low - 40); i--) {
        if (/\s/u.test(letters[i])) { cut = i + 1; break; }
      }
      const prefix = letters.slice(0, cut).join("");
      current().push({ ...block, text: prefix });
      frames.push([]);
      block = { ...block, text: letters.slice(cut).join(""), start: block.start + prefix.length, continued: true };
    }
    current().push(block);
  }
  while (frames.length < minimum) frames.push([]);
  return frames;
}
