import { SESSIONS } from "@/lib/training-week/schedule-2026";

export const SIGNAGE_SLUGS = ["tuesday-workshops-2026", "innovation-showcase-2026"] as const;

export const PRINT_SIGNS = SIGNAGE_SLUGS.map(slug => {
  const session = SESSIONS.find(s => s.slug === (slug === "tuesday-workshops-2026" ? "communication-chameleon-2026" : slug))!;
  const companion = slug === "tuesday-workshops-2026" ? SESSIONS.find(s => s.slug === "negotiation-skills-2026") : undefined;
  const day = new Date(`${session.day}T12:00:00Z`);
  const time = (value: string) => new Date(`${session.day}T${value}:00Z`).toLocaleTimeString("en-CA", { timeZone: "UTC", hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();
  return {
    slug, title: companion ? `${session.title} & ${companion.title}` : session.title,
    date: day.toLocaleDateString("en-CA", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" }),
    time: `${time(session.start)} - ${time(session.end)} ET`,
    venue: companion ? "Top of POD (3rd floor)" : session.venue.name!,
    facilitator: [session.facilitator, companion?.facilitator].filter(Boolean).join(" & "),
    sessions: companion ? [session, companion].map(s => ({ title: s.title, facilitator: s.facilitator ?? "" })) : undefined,
  };
});
