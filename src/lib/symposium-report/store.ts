import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PAGE_REVIEW_COMMENT_LIMIT } from "@/lib/page-review/limits";
import { REPORT_ID, reportSchema } from "./document";

export const reportRevision = (text: string) => createHash("sha256").update(text).digest("hex");

export async function reportTransaction<T>(run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  // A comment write and a round transition must agree on which round was open.
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(run, { isolationLevel: "Serializable" });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt >= 2) throw error;
    }
  }
}

export async function loadReport() {
  const review = await prisma.pageReview.findUnique({
    where: { id: REPORT_ID, kind: "report" },
    include: {
      comments: { orderBy: { createdAt: "asc" }, take: PAGE_REVIEW_COMMENT_LIMIT },
      versions: { orderBy: { round: "desc" }, select: { round: true, html: true } },
    },
  });
  if (!review) return null;
  const { id, url, title, round, status, comments, pastedHtml, versions } = review;
  if (!pastedHtml) throw new Error("The symposium report has no saved document.");
  return {
    report: reportSchema.parse(JSON.parse(pastedHtml)),
    revision: reportRevision(pastedHtml),
    history: versions.map(({ round, html }) => ({ round, report: reportSchema.parse(JSON.parse(html)) })),
    review: {
      id, url, title, round, status,
      comments: comments.map(({ editedAt, createdAt, ...comment }) => ({
        ...comment, editedAt: editedAt?.toISOString() ?? null, createdAt: createdAt.toISOString(),
      })),
    },
  };
}
