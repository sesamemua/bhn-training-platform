import { z } from "zod";
import { emailKey } from "@/lib/eligibility/email-key";

const ImportDetail = z.object({
  email: z.string().email(),
  workshopId: z.string().min(1),
  sourceName: z.string(),
  institute: z.string(),
  position: z.string(),
  company: z.string(),
  participation: z.string(),
  emailSource: z.string(),
});

export interface CoordinatorInfo {
  name: string;
  institution: string;
  position: string;
  company: string;
  participation: string;
  emailSource: string;
  recordedAt: string;
  recordedBy: string;
}

/** The email supplied context, not new answers from the registrant. */
export function coordinatorInfoFor(
  audits: { detail: string | null; createdAt: Date; actor: { name: string | null } }[],
  email: string,
  workshopIds: string[],
): CoordinatorInfo | undefined {
  for (const audit of audits) {
    let detail: unknown;
    try { detail = JSON.parse(audit.detail ?? "null"); } catch { continue; }
    const parsed = ImportDetail.safeParse(detail);
    if (!parsed.success) continue;
    const d = parsed.data;
    if (emailKey(d.email) !== emailKey(email) || !workshopIds.includes(d.workshopId)) continue;
    return {
      name: d.sourceName, institution: d.institute, position: d.position,
      company: d.company, participation: d.participation, emailSource: d.emailSource,
      recordedAt: audit.createdAt.toISOString(), recordedBy: audit.actor.name ?? "Admin",
    };
  }
}
