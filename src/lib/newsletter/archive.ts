/** Read-only provenance for sent Mailchimp issues. Never infer a send timezone. */
export interface NewsletterArchiveMetadata {
  issueId: string;
  campaignId: string;
  sentAt: string | null;
  sendTimeText: string | null;
  archiveUrl: string | null;
  subject: string | null;
}

export function newsletterArchiveKey(issueId: string): string | null {
  const match = /^mailchimp-us12-(\d+)$/.exec(issueId);
  return match ? `newsletter.archive.mailchimp.us12.${match[1]}` : null;
}

export function parseNewsletterArchiveMetadata(value: string | null | undefined, issueId: string): NewsletterArchiveMetadata | null {
  if (!value || !newsletterArchiveKey(issueId)) return null;
  try {
    const data = JSON.parse(value);
    if (data.version !== 1 || data.issueId !== issueId || `mailchimp-us12-${data.campaignId}` !== issueId) return null;
    const text = (input: unknown, max: number) => typeof input === "string" && input.trim() && input.length <= max ? input : null;
    let archiveUrl: string | null = null;
    if (typeof data.archiveUrl === "string" && data.archiveUrl.length <= 2000) {
      const url = new URL(data.archiveUrl);
      if (url.protocol === "https:" && url.hostname === "mailchi.mp" && !url.username && !url.password && !url.port) archiveUrl = url.href;
    }
    // A day-only value is deliberately not parsed as a local/UTC send instant.
    const sentAt = typeof data.sentAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.sentAt) ? data.sentAt : null;
    return { issueId, campaignId: String(data.campaignId), sentAt, sendTimeText: text(data.sendTimeText, 200), archiveUrl, subject: text(data.subject, 500) };
  } catch { return null; }
}

export function newsletterArchiveDateLabel(metadata: NewsletterArchiveMetadata | null): string | null {
  return metadata?.sendTimeText || metadata?.sentAt || null;
}
