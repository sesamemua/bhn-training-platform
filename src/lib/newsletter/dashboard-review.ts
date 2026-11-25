import { prisma } from "@/lib/prisma";
import { currentCycle } from "./currentIssue";

export interface NewsletterDashboardReview {
  issueId: string | null;
  title: string;
  review: { id: string; round: number; status: string } | null;
  sent: boolean;
}

/** Read-only counterpart to resolveCurrentIssue: viewing a dashboard never creates an issue or opens a round. */
export async function loadNewsletterDashboardReview(): Promise<NewsletterDashboardReview> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  const cycle = await currentCycle(today);
  const issue = cycle
    ? (cycle.issueId ? await prisma.newsletterIssue.findUnique({ where: { id: cycle.issueId }, select: { id: true, title: true, status: true } }) : null)
    : await prisma.newsletterIssue.findFirst({ where: { status: { not: "sent" } }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, status: true } });
  const review = issue ? await prisma.pageReview.findUnique({
    where: { id: `newsletter-${issue.id}` }, select: { id: true, round: true, status: true },
  }) : null;
  const month = cycle?.month ? new Date(`${cycle.month}T12:00:00Z`).toLocaleDateString("en-CA", { month: "long", year: "numeric", timeZone: "UTC" }) : null;
  return {
    issueId: issue?.id ?? null,
    title: issue?.title ?? (month ? `${month} Newsletter` : "Newsletter"),
    review,
    sent: issue?.status === "sent" || cycle?.status === "sent",
  };
}
