import { LINKEDIN_FEEDBACK_PATH, type LinkedinTestimonial } from "./linkedin";

export const LINKEDIN_FEEDBACK_URL = `https://bhn-training-platform.vercel.app${LINKEDIN_FEEDBACK_PATH}`;

export function linkedinFeedbackClipboard(quotes: LinkedinTestimonial[]) {
  const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
  return {
    text: quotes.length ? `${quotes.map(q => [`“${q.quote}”`, q.author, q.profile?.title, q.profile?.affiliation, q.sourceUrl].filter(Boolean).join("\n")).join("\n\n")}\n\nCommunity reflections: ${LINKEDIN_FEEDBACK_URL}` : "",
    html: quotes.length ? `${quotes.map(q => `<blockquote><p>${escape(q.quote).replace(/\r?\n/g, "<br>")}</p></blockquote><p><strong>${escape(q.author)}</strong>${[q.profile?.title, q.profile?.affiliation].filter(Boolean).map(value => `<br>${escape(value!)}`).join("")}<br><a href="${escape(q.sourceUrl)}">Original LinkedIn ${q.kind === "comment" ? "comment" : "post"}</a></p>`).join("\n")}<p><a href="${LINKEDIN_FEEDBACK_URL}">BioHubNet community reflections</a></p>` : "",
  };
}
