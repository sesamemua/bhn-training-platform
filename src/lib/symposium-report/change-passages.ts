import { diffArrays } from "diff";
import { reportBlocks } from "./paginate";
import { marks, type Mark } from "./changes";

export type ChangePassage = { key: string; label: string; before: string; after: string; marks: Mark[]; start?: number; end?: number; author?: string; at?: string };

/** Compare complete paragraphs; current source offsets also identify linked-page fragments. */
export function changePassages(key: string, label: string, before: string, after: string): ChangePassage[] {
  if (before === after) return [];
  if (!key.endsWith(":text")) return [{ key, label, before, after, marks: marks(before, after) }];
  const old = reportBlocks(before), next = reportBlocks(after);
  const parts = diffArrays(old.map(b => `${b.kind}\n${b.text}`), next.map(b => `${b.kind}\n${b.text}`));
  const out: ChangePassage[] = [];
  let oldAt = 0, nextAt = 0, removed: string[] = [], added: string[] = [], first = 0, last = 0;
  function flush() {
    if (!removed.length && !added.length) return;
    const anchor = next[Math.min(first, next.length - 1)];
    const start = anchor?.start ?? 0;
    const end = added.length ? next[last - 1].start + next[last - 1].text.length : start;
    const a = removed.join("\n\n"), b = added.join("\n\n");
    out.push({ key, label: `${label} · paragraph ${first + 1}`, before: a, after: b, marks: marks(a, b), start, end });
    removed = []; added = [];
  }
  for (const part of parts) {
    if (!part.added && !part.removed) { flush(); oldAt += part.count!; nextAt += part.count!; continue; }
    if (!removed.length && !added.length) first = nextAt;
    if (part.removed) { removed.push(...old.slice(oldAt, oldAt + part.count!).map(b => b.text)); oldAt += part.count!; }
    if (part.added) { added.push(...next.slice(nextAt, nextAt + part.count!).map(b => b.text)); nextAt += part.count!; last = nextAt; }
  }
  flush();
  return out;
}
