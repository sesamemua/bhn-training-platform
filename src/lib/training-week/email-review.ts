import { MERGE_FIELDS, fieldsUsed, render, type ResolvedTemplate } from "@/lib/allocation/email-templates";
import { withHtmlSignature } from "@/lib/mail-signature";
import { letterHtml } from "./letter-html";

export interface ReviewWorkshop {
  slug: string;
  title: string;
  startDateTime: Date;
  endDateTime: Date;
  locationName: string | null;
}

export interface TrainingEmailReviewSummary {
  id: string;
  round: number;
  status: string;
}

export interface TrainingEmailReviewBundle {
  review: TrainingEmailReviewSummary | null;
  emailCount: number;
  workshopCount: number;
  stale: boolean;
  issues: string[];
}

export const trainingEmailReviewId = (eventId: string) => `training-week-emails-${eventId}`;
export const trainingEmailReviewLink = (eventId: string) => `/api/workspace/page-review/${encodeURIComponent(trainingEmailReviewId(eventId))}/launch`;

const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const CHECK_IN = "https://example.invalid/personal-check-in";
const DAY = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Toronto", weekday: "long", day: "numeric", month: "long" });
const CLOCK = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Toronto", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** The same wording, merge fields, HTML renderer and signature as attendee sends; no attendee data or live check-in tokens. */
export function buildTrainingEmailReview(workshops: ReviewWorkshop[], templates: ResolvedTemplate[], signature: string) {
  const reminders = templates.filter((template) => ["reminder_3day", "reminder_same_day"].includes(template.id));
  if (reminders.length !== 2) throw new Error("Both check-in reminder templates are required.");
  const issues: string[] = [];
  const samples = Object.fromEntries(MERGE_FIELDS.map((field) => [field.key, field.sample]));
  const sections = [...workshops].sort((a, b) => a.startDateTime.getTime() - b.startDateTime.getTime() || a.slug.localeCompare(b.slug)).flatMap((workshop) => {
    const date = DAY.format(workshop.startDateTime);
    const time = `${CLOCK.format(workshop.startDateTime)}–${CLOCK.format(workshop.endDateTime)}`;
    if (!workshop.locationName?.trim()) issues.push(`${workshop.title}: location is not set.`);
    return reminders.map((template) => {
      const used = fieldsUsed(template.body);
      for (const field of ["session_time", "session_venue", "check_in_link"]) {
        if (!used.includes(field)) issues.push(`${template.name}: {{${field}}} is missing from the message.`);
      }
      const vars = {
        ...samples, first_name: "First name", name: "Recipient name", event: "BioHubNet Training Week 2026",
        session: workshop.title, session_date: date, session_time: time,
        session_venue: workshop.locationName?.trim() || "to be confirmed", check_in_link: CHECK_IN,
        coordinator: "The BioHubNet team",
      };
      const subject = render(template.subject, vars).text;
      const body = render(template.body, vars).text;
      const content = withHtmlSignature(letterHtml(body, [{ url: CHECK_IN, label: "Check in", tone: "primary" }]), signature);
      return `<section id="email-${esc(workshop.slug)}-${template.id}" class="email-preview">` +
        `<h2>${esc(workshop.title)} · ${esc(template.name)}</h2>` +
        `<p class="facts">${esc(date)} · ${esc(time)} Toronto time<br>${esc(vars.session_venue)}</p>` +
        `<p class="subject"><strong>Subject:</strong> ${esc(subject)}</p>${content}</section>`;
    });
  });
  const uniqueIssues = [...new Set(issues)];
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>Training Week check-in email review</title><style>` +
    `*{box-sizing:border-box}body{margin:0;background:#f4f7f8;color:#17212b;font:16px/1.5 Arial,sans-serif;overflow-wrap:anywhere}` +
    `main{width:min(100% - 32px,680px);margin:32px auto}h1{font-size:26px}h2{font-size:19px;margin:0 0 8px}` +
    `.email-preview{padding:28px 0;border-top:1px solid #ccd6dd}.facts{font-size:14px;color:#435564}.subject{margin:16px 0}` +
    `.issues{background:#fff4db;color:#6b4300;padding:16px;border-radius:6px}.meta{color:#435564;font-size:14px}` +
    `</style></head><body><main><header><h1>Training Week check-in emails</h1>` +
    `<p>${sections.length} emails · ${workshops.length} workshops · October 2026</p>` +
    `<p class="meta">Sample recipient: First name. Personal check-in links are placeholders. All times are Toronto local time.</p>` +
    (uniqueIssues.length ? `<ul class="issues">${uniqueIssues.map((issue) => `<li>${esc(issue)}</li>`).join("")}</ul>` : "") +
    `</header>${sections.join("")}</main></body></html>`;
  return { html, emailCount: sections.length, workshopCount: workshops.length, issues: uniqueIssues };
}
