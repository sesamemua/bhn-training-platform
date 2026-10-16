import { z } from "zod";

export const EmailHistoryAddresses = z.array(z.string().trim().toLowerCase().max(320)).max(5000);
const sentReceipt = z.object({ email: z.string(), state: z.literal("sent") });

/** Actual recorded recipients, not inferred from registration or decision status. */
export function recordedEmailRecipients(
  addresses: string[],
  copies: { to: string }[],
  audits: { detail: string | null }[],
): Set<string> {
  const wanted = new Set(addresses.map((e) => e.trim().toLowerCase()).filter(Boolean));
  const sent = new Set<string>();
  const add = (email: string) => {
    const key = email.trim().toLowerCase();
    if (wanted.has(key)) sent.add(key);
  };
  for (const copy of copies) add(copy.to);
  for (const audit of audits) {
    try {
      const receipt = sentReceipt.safeParse(JSON.parse(audit.detail ?? "null"));
      if (receipt.success) add(receipt.data.email);
    } catch { /* Older audit details may not be JSON. */ }
  }
  return sent;
}
