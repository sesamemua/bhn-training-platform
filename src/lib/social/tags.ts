export const SOCIAL_MENTIONS = [
  "@Molly Shoichet",
  "@Gilbert Walker",
  "@Darius Rackus",
  "@Yoo Jin Park",
  "@Akshita Vincent",
  "@Epshita Islam",
  "@Yeseul",
  "@Roshni",
  "@Canadian Hub for Health Intelligence and Innovation in Infectious Diseases (HI³)",
  "@BioHubNet",
] as const;

/** Posts the team writes from scratch carry no standing symposium tags. */
export function withSocialTags(body: string, stream?: string): string {
  if (stream === "linkedin") return body;
  const footer = SOCIAL_MENTIONS.join(", ");
  return body.trimEnd().endsWith(footer) ? body : `${body.trimEnd()}\n\n${footer}`;
}

/** People and partners the team can tag on a LinkedIn post (the page itself isn't one of them). */
export const TAGGABLE = SOCIAL_MENTIONS.filter((m) => m !== "@BioHubNet");
/** Short chip label: "@Canadian Hub … (HI³)" → "HI³". */
export const tagLabel = (m: string) => m.match(/\(([^)]+)\)\s*$/)?.[1] ?? m.replace(/^@/, "");

const isMentionLine = (line: string) => line.trim() !== "" && line.split(",").every((part) => part.trim().startsWith("@"));

export function hasMention(body: string, mention: string): boolean {
  return body.split("\n").some((line) => isMentionLine(line) && line.split(",").some((p) => p.trim() === mention));
}

/**
 * Add a mention to the post's closing mentions line (created if there
 * isn't one), or take it out if it's already there. An emptied line goes.
 */
export function toggleMention(body: string, mention: string): string {
  const lines = body.replace(/\s+$/, "").split("\n");
  const last = lines.length - 1;
  if (last >= 0 && isMentionLine(lines[last])) {
    const parts = lines[last].split(",").map((p) => p.trim()).filter(Boolean);
    const next = parts.includes(mention) ? parts.filter((p) => p !== mention) : [...parts, mention];
    if (next.length) lines[last] = next.join(", ");
    else { lines.pop(); while (lines.length && !lines[lines.length - 1].trim()) lines.pop(); }
    return lines.join("\n");
  }
  return `${body.replace(/\s+$/, "")}${body.trim() ? "\n\n" : ""}${mention}`;
}
