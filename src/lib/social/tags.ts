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

export function withSocialTags(body: string): string {
  const footer = SOCIAL_MENTIONS.join(", ");
  return body.trimEnd().endsWith(footer) ? body : `${body.trimEnd()}\n\n${footer}`;
}
