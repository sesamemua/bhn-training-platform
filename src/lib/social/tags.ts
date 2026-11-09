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
