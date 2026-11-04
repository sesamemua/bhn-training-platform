import type { LinkedinTestimonial } from "./linkedin";

export function linkedinFeedbackClipboard(quotes: LinkedinTestimonial[]) {
  const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
  return {
    text: quotes.map(q => `“${q.quote}”\n${q.author}\n${q.sourceUrl}`).join("\n\n"),
    html: quotes.map(q => `<blockquote><p>${escape(q.quote).replace(/\r?\n/g, "<br>")}</p></blockquote><p><strong>${escape(q.author)}</strong><br><a href="${escape(q.sourceUrl)}">Original LinkedIn post</a></p>`).join("\n"),
  };
}
