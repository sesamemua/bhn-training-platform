import type { LinkedinTestimonial } from "./linkedin";

export function linkedinFeedbackClipboard(quotes: LinkedinTestimonial[]) {
  const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
  return {
    text: quotes.map(q => [`“${q.quote}”`, q.author, q.profile?.title, q.profile?.affiliation, q.sourceUrl].filter(Boolean).join("\n")).join("\n\n"),
    html: quotes.map(q => `<blockquote><p>${escape(q.quote).replace(/\r?\n/g, "<br>")}</p></blockquote><p><strong>${escape(q.author)}</strong>${[q.profile?.title, q.profile?.affiliation].filter(Boolean).map(value => `<br>${escape(value!)}`).join("")}<br><a href="${escape(q.sourceUrl)}">Original LinkedIn ${q.kind === "comment" ? "comment" : "post"}</a></p>`).join("\n"),
  };
}
