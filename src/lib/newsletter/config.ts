/**
 * Newsletter production config — who gets chased, and on what rhythm.
 *
 * Stored as one JSON row in PlatformSetting (key `newsletterSchedule`),
 * the same override-a-code-default pattern the EQUIP email templates use.
 * A missing row means "use the defaults below", so the feature works the
 * moment it ships and the row only records deliberate changes.
 *
 * Everything here is editable from the calendar UI, which is what "these
 * parameters can be configured manually or automatically" asks for: the
 * schedule shape and the recipient list are config, and each reminder can
 * be set to send itself or to prompt a human to send it.
 */
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_SCHEDULE,
  REMINDER_KINDS,
  isSendWeekday,
  type ReminderKind,
  type ReminderMode,
  type ScheduleConfig,
} from "./schedule";

export const NEWSLETTER_CONFIG_KEY = "newsletterSchedule";

/** A program lead who owns one section of the newsletter. */
export interface LeadRecipient {
  /** Which section they write — engage | experience | equip | event. */
  section: string;
  name: string;
  email: string;
}

export interface NewsletterConfig {
  schedule: ScheduleConfig;
  /** Program leads chased for drafts. */
  leads: LeadRecipient[];
  /** Copied on every lead-facing reminder. */
  cc: string[];
  /** Has the final say. Their sign-off is what the approval records. */
  approver: { name: string; email: string };
  /** Where "remind me to send the reminders" lands. */
  coordinator: { name: string; email: string };
  /** Per-reminder delivery mode. */
  modes: Record<ReminderKind, ReminderMode>;
  /** Fold statutory holidays into the business-day arithmetic. */
  useStatHolidays: boolean;
}

/**
 * Defaults reflect the team as it stands: Epshita owns ENGAGE, Yeseul
 * EXPERIENCE, Roshni EQUIP; Yoo Jin is copied on everything and holds the
 * final approval; Ruilin coordinates. Emails are the U of T addresses
 * already on these accounts in the platform.
 */
export const DEFAULT_CONFIG: NewsletterConfig = {
  schedule: DEFAULT_SCHEDULE,
  leads: [
    { section: "engage", name: "Epshita Islam", email: "epshita.islam@utoronto.ca" },
    { section: "experience", name: "Yeseul Lee", email: "yes.lee@utoronto.ca" },
    { section: "equip", name: "Roshni Christo", email: "roshni.christo@utoronto.ca" },
  ],
  cc: ["yoojin.park@utoronto.ca"],
  approver: { name: "Yoo Jin Park", email: "yoojin.park@utoronto.ca" },
  coordinator: { name: "Ruilin Yuan", email: "ruilin.yuan@utoronto.ca" },
  // Lead-facing nudges default to manual — a chase email reads better
  // from a person than from a platform, and the coordinator asked to be
  // reminded to send them. The two internal ones send themselves.
  modes: {
    draft_request: "manual",
    draft_due: "manual",
    approval: "auto",
    send_day: "auto",
  },
  useStatHolidays: true,
};

const isEmail = (v: unknown): v is string =>
  typeof v === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());

const person = (v: unknown, fallback: { name: string; email: string }) => {
  if (!v || typeof v !== "object") return fallback;
  const o = v as Record<string, unknown>;
  return {
    name: typeof o.name === "string" && o.name.trim() ? o.name.trim() : fallback.name,
    email: isEmail(o.email) ? o.email.trim() : fallback.email,
  };
};

/**
 * Parse a stored blob into a usable config, falling back field by field.
 * Deliberately total: a half-written or hand-edited row degrades to the
 * defaults for the parts it got wrong instead of throwing inside a cron.
 */
export function parseConfig(raw: unknown): NewsletterConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_CONFIG;
  const o = raw as Record<string, unknown>;
  const s = (o.schedule ?? {}) as Record<string, unknown>;

  const clampDays = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 10 ? v : fallback;

  const holidays = Array.isArray(s.holidays)
    ? s.holidays.filter((h): h is string => typeof h === "string" && /^\d{4}-\d{2}-\d{2}$/.test(h))
    : DEFAULT_SCHEDULE.holidays;

  const leads = Array.isArray(o.leads)
    ? o.leads
        .filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
        .filter((l) => isEmail(l.email) && typeof l.section === "string")
        .map((l) => ({
          section: String(l.section),
          name: typeof l.name === "string" ? l.name : String(l.email),
          email: String(l.email).trim(),
        }))
    : DEFAULT_CONFIG.leads;

  const modes = { ...DEFAULT_CONFIG.modes };
  if (o.modes && typeof o.modes === "object") {
    for (const k of REMINDER_KINDS) {
      const v = (o.modes as Record<string, unknown>)[k];
      if (v === "auto" || v === "manual") modes[k] = v;
    }
  }

  return {
    schedule: {
      sendWeekday: isSendWeekday(Number(s.sendWeekday))
        ? (Number(s.sendWeekday) as ScheduleConfig["sendWeekday"])
        : DEFAULT_SCHEDULE.sendWeekday,
      weekOfMonth:
        typeof s.weekOfMonth === "number" && s.weekOfMonth >= 1 && s.weekOfMonth <= 5
          ? s.weekOfMonth
          : DEFAULT_SCHEDULE.weekOfMonth,
      draftDays: clampDays(s.draftDays, DEFAULT_SCHEDULE.draftDays),
      buildDays: clampDays(s.buildDays, DEFAULT_SCHEDULE.buildDays),
      holidays,
    },
    leads: leads.length ? leads : DEFAULT_CONFIG.leads,
    cc: Array.isArray(o.cc) ? o.cc.filter(isEmail).map((e) => e.trim()) : DEFAULT_CONFIG.cc,
    approver: person(o.approver, DEFAULT_CONFIG.approver),
    coordinator: person(o.coordinator, DEFAULT_CONFIG.coordinator),
    modes,
    useStatHolidays:
      typeof o.useStatHolidays === "boolean" ? o.useStatHolidays : DEFAULT_CONFIG.useStatHolidays,
  };
}

export async function getNewsletterConfig(): Promise<NewsletterConfig> {
  const row = await prisma.platformSetting
    .findUnique({ where: { key: NEWSLETTER_CONFIG_KEY } })
    .catch(() => null);
  if (!row?.value) return DEFAULT_CONFIG;
  try {
    return parseConfig(JSON.parse(row.value));
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveNewsletterConfig(next: NewsletterConfig): Promise<NewsletterConfig> {
  const clean = parseConfig(next); // never store what we wouldn't accept back
  const value = JSON.stringify(clean);
  await prisma.platformSetting.upsert({
    where: { key: NEWSLETTER_CONFIG_KEY },
    create: { key: NEWSLETTER_CONFIG_KEY, value },
    update: { value },
  });
  return clean;
}

/** Everyone a lead-facing reminder goes to, deduped. */
export function leadRecipients(config: NewsletterConfig): string[] {
  return [...new Set(config.leads.map((l) => l.email))];
}

/** True when this address may record the final approval. */
export function isApprover(config: NewsletterConfig, email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === config.approver.email.toLowerCase();
}
