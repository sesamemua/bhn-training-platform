/**
 * The email that goes out when you ask somebody for something.
 *
 * Pure: builds the message, sends nothing. That matters here more than
 * usual — the rule for this feature is that no email leaves the platform
 * without a person clicking send, so the code that COMPOSES a message is
 * deliberately unable to deliver one. Only the notify route can do that,
 * and only when called.
 *
 * Replies go to the person who asked, not to the platform. A colleague
 * hitting reply should reach a human, not a no-reply mailbox.
 */
import { KIND_LABEL, NOTHING, type PickKind } from "./picker";

export interface AskEmailInput {
  /** What to call the recipient — see callNameOf. */
  callName: string;
  askerName: string;
  subject: string;
  body: string;
  kind: PickKind;
  bribe: string;
  /** In-app path, e.g. /admin/workspace/merch. */
  href?: string | null;
  /** Absolute origin, so the link works from an inbox. */
  origin: string;
}

export interface BuiltEmail {
  subject: string;
  text: string;
  html: string;
}

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** An in-app path becomes a full URL; anything already absolute is left alone. */
export function absoluteUrl(origin: string, href?: string | null): string | null {
  const h = (href ?? "").trim();
  if (!h) return null;
  if (/^https?:\/\//i.test(h)) return h;
  if (!h.startsWith("/")) return null;
  return `${origin.replace(/\/$/, "")}${h}`;
}

export function buildAskEmail(input: AskEmailInput): BuiltEmail {
  const link = absoluteUrl(input.origin, input.href);
  const offered = input.bribe.trim().toLowerCase() === NOTHING ? "" : input.bribe.trim();
  const kindLabel = (KIND_LABEL[input.kind] ?? "A question").toLowerCase();

  const text = [
    `${input.callName},`,
    "",
    `${input.askerName} has ${kindLabel.startsWith("a ") ? kindLabel : `a ${kindLabel}`} for you.`,
    "",
    input.body.trim(),
    "",
    link ? `Where to do it: ${link}` : "",
    offered ? `Offered in return: ${offered}.` : "",
    "",
    `Reply to this email, or answer it on the platform: ${input.origin.replace(/\/$/, "")}/admin/workspace/brain-picker`,
    "",
    "— sent from the BioHubNet Brain Picker, by a person who pressed send.",
  ].filter((l) => l !== undefined).join("\n").replace(/\n{3,}/g, "\n\n").trim();

  const html = [
    `<p>${escape(input.callName)},</p>`,
    `<p><strong>${escape(input.askerName)}</strong> has ${escape(kindLabel.startsWith("a ") ? kindLabel : `a ${kindLabel}`)} for you.</p>`,
    `<p style="white-space:pre-line">${escape(input.body.trim())}</p>`,
    link
      ? `<p><a href="${escape(link)}" style="display:inline-block;padding:10px 16px;background:#1e3765;color:#fff;border-radius:6px;text-decoration:none;font-weight:700">Open the thing</a></p>`
      : "",
    offered ? `<p style="color:#586778">Offered in return: ${escape(offered)}.</p>` : "",
    `<p style="color:#586778;font-size:13px">Reply to this email, or answer it on <a href="${escape(input.origin.replace(/\/$/, ""))}/admin/workspace/brain-picker">the platform</a>.</p>`,
    `<p style="color:#8a97a5;font-size:12px">Sent from the BioHubNet Brain Picker, by a person who pressed send.</p>`,
  ].filter(Boolean).join("\n");

  return { subject: input.subject.trim(), text, html };
}
