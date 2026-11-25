import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isSection, type Section } from "./types";
import type { PreserveWording } from "./wording";

const prefix = (issueId: string) => `newsletter.wording.${issueId}.`;

export class NewsletterWordingError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function getPreserveWording(issueId: string, db: Pick<Prisma.TransactionClient, "platformSetting"> = prisma): Promise<PreserveWording> {
  const rows = await db.platformSetting.findMany({ where: { key: { startsWith: prefix(issueId) } }, select: { key: true, value: true } });
  const result: PreserveWording = {};
  for (const row of rows) {
    const section = row.key.slice(prefix(issueId).length);
    if (!isSection(section)) continue;
    // Fail closed: corrupt policy must never silently enable rewriting.
    if (row.value !== "true" && row.value !== "false") throw new NewsletterWordingError("Saved wording options could not be read. Please contact an editor.", 500);
    result[section] = row.value === "true";
  }
  return result;
}

/** One key per section prevents updates to different sections overwriting each other. */
export async function setPreserveWording(issueId: string, section: Section, preserveWording: boolean): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await prisma.$transaction(async (tx) => {
        const issue = await tx.newsletterIssue.findUnique({ where: { id: issueId }, select: { status: true } });
        if (!issue) throw new NewsletterWordingError("Issue not found.", 404);
        if (issue.status === "sent") throw new NewsletterWordingError("Sent newsletters cannot be changed.", 409);
        const key = `${prefix(issueId)}${section}`;
        const previous = await tx.platformSetting.findUnique({ where: { key }, select: { value: true } });
        if (previous?.value === String(preserveWording) || (!previous && !preserveWording)) return;
        await tx.platformSetting.upsert({ where: { key }, create: { key, value: String(preserveWording) }, update: { value: String(preserveWording) } });
        // Do not replace polished HTML or existing review rounds. Mark export stale.
        await tx.newsletterIssue.update({ where: { id: issueId }, data: { renderedAt: null } });
      }, { isolationLevel: "Serializable" });
      return;
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (!["P2034", "P2002"].includes(code)) throw error;
      if (attempt === 3) throw new NewsletterWordingError("Another editor changed this issue. Please try again.", 409);
    }
  }
}
