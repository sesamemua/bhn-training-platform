/**
 * The copy of a speaker submission that goes to the coordinators.
 *
 * Sent the moment a speaker finishes the form, so nobody has to keep
 * checking the admin page to find out whether anything arrived. It is a
 * copy, not a notification: everything the speaker typed is in the body,
 * because the point is to be readable on a phone without signing in.
 *
 * Pure — no Prisma, no mailer. That is what lets it be tested and
 * previewed without sending anything.
 */
import { absolute } from "./email";

/**
 * Who gets the copy.
 *
 * Hard-coded on purpose rather than read from the address book: this is
 * not "tell a colleague about a feature", it is the pair of people who
 * are accountable for this event's speakers. Changing it should be a
 * commit somebody reviews, not a row somebody deletes by accident.
 */
export const SPEAKER_SUBMISSION_RECIPIENTS = [
  "yes.lee@utoronto.ca",
  "Ruilin.yuan@utoronto.ca",
] as const;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface SpeakerSubmission {
  eventTitle: string;
  slug: string;
  fullName: string;
  title: string | null;
  organization: string | null;
  bio: string | null;
  linkedinUrl: string | null;
  sessionTitle: string | null;
  sessionPitch: string | null;
  photoUrl: string | null;
}

export interface SubmissionMail {
  subject: string;
  text: string;
  html: string;
}

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/** "—" rather than an empty gap, so a missing answer is visibly missing. */
const or = (v: string | null | undefined) => (v && v.trim() ? v.trim() : "—");

export function speakerSubmissionEmail(s: SpeakerSubmission): SubmissionMail {
  const adminUrl = absolute(`/admin/events/${encodeURIComponent(s.slug)}/speakers`);

  const rows: [string, string][] = [
    ["Name", or(s.fullName)],
    ["Title / role", or(s.title)],
    ["Company / institution", or(s.organization)],
    ["LinkedIn", or(s.linkedinUrl)],
    ["Session title", or(s.sessionTitle)],
    ["Biography", or(s.bio)],
    ["Advice they plan to share", or(s.sessionPitch)],
  ];

  const subject = `Speaker details: ${s.fullName} — ${s.eventTitle}`;

  const text = [
    `${s.fullName} has filled in their speaker details for ${s.eventTitle}.`,
    "",
    ...rows.map(([k, v]) => `${k.toUpperCase()}\n${v}\n`),
    s.photoUrl ? `HEADSHOT\n${s.photoUrl}\n` : "HEADSHOT\n—\n",
    "Edit or remove any of this on the admin page:",
    adminUrl,
    "",
    "Sent from the BHN Training Platform.",
  ].join("\n");

  const row = ([k, v]: [string, string]) => `
    <tr>
      <td style="padding:9px 14px 9px 0;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#64748b;white-space:nowrap;vertical-align:top;border-bottom:1px solid #e2e8f0;">${esc(k)}</td>
      <td style="padding:9px 0;font-size:14.5px;line-height:1.6;color:#0f172a;border-bottom:1px solid #e2e8f0;white-space:pre-wrap;">${esc(v)}</td>
    </tr>`;

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:${FONT};color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:14px;border:1px solid #e2e8f0;">
        <tr><td style="padding:26px 30px 4px 30px;">
          <p style="margin:0 0 4px 0;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#64748b;font-weight:700;">Speaker details received</p>
          <p style="margin:0 0 18px 0;font-size:16px;line-height:1.55;color:#0f172a;"><strong>${esc(s.fullName)}</strong> has filled in their details for ${esc(s.eventTitle)}.</p>
        </td></tr>
        ${
          s.photoUrl
            ? `<tr><td style="padding:0 30px 18px 30px;">
                 <img src="${esc(s.photoUrl)}" width="104" height="104" alt="" style="display:block;width:104px;height:104px;border-radius:52px;object-fit:cover;border:1px solid #e2e8f0;">
               </td></tr>`
            : ""
        }
        <tr><td style="padding:0 30px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.map(row).join("")}</table>
        </td></tr>
        <tr><td style="padding:20px 30px 26px 30px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="border-radius:10px;background:#3b6cef;">
              <a href="${esc(adminUrl)}" style="display:inline-block;padding:11px 20px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">Open the admin page</a>
            </td>
          </tr></table>
          <p style="margin:10px 0 0 0;font-size:12px;color:#64748b;line-height:1.55;">Edit or remove any of this before it goes on the website.<br><a href="${esc(adminUrl)}" style="color:#3b6cef;text-decoration:none;">${esc(adminUrl)}</a></p>
        </td></tr>
        <tr><td style="padding:14px 30px 20px 30px;border-top:1px solid #e2e8f0;background:#f8fafc;border-radius:0 0 14px 14px;">
          <p style="margin:0;font-size:11.5px;color:#64748b;line-height:1.6;">Sent from the BHN Training Platform when the speaker submitted the form.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}
