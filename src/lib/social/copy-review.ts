import { z } from "zod";

export const SOCIAL_COPY_REVIEW_PREFIX = "social-copy-";
export const socialCopyReviewId = (postId: string) => SOCIAL_COPY_REVIEW_PREFIX + postId;
export const socialCopyReviewPath = (postId: string) => `/review/social/${encodeURIComponent(postId)}`;
export const socialCopyReviewApi = (postId: string) => `/api/workspace/social-review/${encodeURIComponent(postId)}`;
export const canReviewSocialCopy = (status: string) => ["draft", "approved"].includes(status);

export const SocialCopySnapshot = z.object({ title: z.string().max(200), body: z.string().max(25000) });

export function socialCopySnapshot(body: string, assetSpec: unknown) {
  const title = (assetSpec as { title?: unknown } | null)?.title;
  return SocialCopySnapshot.parse({ title: typeof title === "string" ? title.slice(0, 200) : "LinkedIn post", body });
}

export function socialCopySnapshotHtml(serialized: string) {
  const { title, body } = SocialCopySnapshot.parse(JSON.parse(serialized));
  const escape = (text: string) => text.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char]!);
  return `<!doctype html><html><head><style>body{margin:0;padding:18px;overflow-wrap:anywhere;color:#14242d;background:#fff;font:16px/1.5 system-ui}h1{font-size:20px}p{white-space:pre-wrap}</style></head><body><h1>${escape(title)}</h1>${body.split(/\n\s*\n/).map((p) => `<p>${escape(p)}</p>`).join("")}</body></html>`;
}
