/**
 * Open / click tracking for campaign e-mails (server only: node:crypto).
 * Tokens are HMAC-signed with NEXTAUTH_SECRET, so nothing extra is stored.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

function sign(payload: string): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is not configured — cannot sign tracking links.");
  return createHmac("sha256", secret).update(`track:${payload}`).digest("base64url").slice(0, 22);
}

function sameSig(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const openToken = (sendId: string) => `${sendId}.${sign(sendId)}`;
export function readOpenToken(token: string): string | null {
  const [id, sig] = token.split(".");
  return id && sig && sameSig(sig, sign(id)) ? id : null;
}

/** Signed per-URL, so the click endpoint can never be used as an open redirect. */
export const clickSig = (sendId: string, url: string) => sign(`${sendId}|${url}`);
export const verifyClick = (sendId: string, url: string, sig: string) => sameSig(sig, clickSig(sendId, url));

export function clickUrl(origin: string, sendId: string, url: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/api/outreach/click/${sendId}?u=${encodeURIComponent(url)}&s=${clickSig(sendId, url)}`;
}

const URL_RE = /https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?]/g;

/** Wrap every link except the unsubscribe one (that must stay a direct link). */
export function trackLinks(text: string, wrap: (url: string) => string, skip: (url: string) => boolean): string {
  return text.replace(URL_RE, (u) => (skip(u) ? u : wrap(u)));
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The HTML twin of a plain-text email: same words, links clickable, a 1×1
 * open pixel at the end. Deliberately unstyled so it still reads like a
 * colleague wrote it. `display` maps a (tracked) href back to the URL the
 * reader should see.
 */
export function textToHtml(text: string, pixelUrl: string | null, display: (href: string) => string = (h) => h): string {
  const body = esc(text).replace(URL_RE, (u) => {
    const href = u.replace(/&amp;/g, "&");
    return `<a href="${esc(href)}">${esc(display(href))}</a>`;
  }).replace(/\n/g, "<br>\n");
  const pixel = pixelUrl ? `<img src="${esc(pixelUrl)}" width="1" height="1" alt="" style="display:block;border:0">` : "";
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1a1a1a">${body}</div>${pixel}`;
}

/** 1×1 transparent GIF. */
export const PIXEL_GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

