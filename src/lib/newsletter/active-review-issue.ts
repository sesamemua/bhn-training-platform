import { prisma } from "@/lib/prisma";

/** Review follows the most recently active saved review, not the Compose cycle. */
export async function activeNewsletterReviewIssue(): Promise<string | null> {
  const prefix = "newsletter-";
  const reviews = await prisma.pageReview.findMany({
    where: { id: { startsWith: prefix }, kind: "paste", status: "open", pastedHtml: { not: "" } },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    select: { id: true },
  });
  const ordered = reviews.map(({ id }) => id.slice(prefix.length)).filter(Boolean);
  if (!ordered.length) return null;
  const issues = await prisma.newsletterIssue.findMany({
    where: { id: { in: ordered }, status: { not: "sent" } }, select: { id: true },
  });
  const eligible = new Set(issues.map(({ id }) => id));
  return ordered.find(id => eligible.has(id)) ?? null;
}
