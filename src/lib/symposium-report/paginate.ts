export type Block = { kind: "paragraph" | "heading" | "note"; text: string; continued?: boolean };

export function reportBlocks(text: string): Block[] {
  return text.split(/\n\s*\n/).flatMap((paragraph): Block[] => {
    const value = paragraph.trim();
    if (!value) return [];
    if (value.startsWith("## ")) return [{ kind: "heading", text: value.slice(3) }];
    if (value.startsWith("> ")) return [{ kind: "note", text: value.slice(2) }];
    return [{ kind: "paragraph", text: value }];
  });
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
      current().push({ ...block, text: letters.slice(0, cut).join("") });
      frames.push([]);
      block = { ...block, text: letters.slice(cut).join(""), continued: true };
    }
    current().push(block);
  }
  while (frames.length < minimum) frames.push([]);
  return frames;
}
