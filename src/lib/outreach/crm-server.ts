/**
 * Marketing CRM — database half. Everything the CRM pages need about a
 * person is derived here from rows the platform already keeps (touches,
 * campaign sends, form submissions, event registrations, accounts), matched
 * by e-mail, so nothing has to be double-entered.
 */
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { emailKey } from "@/lib/outreach/directory";
import { CRM_CAPTURE_SETTING, guessIdentity, leadScore, type FilterablePerson, type CrmFilter, matchesFilter } from "@/lib/outreach/crm";

const asValues = (v: unknown): Record<string, string> =>
  typeof v === "object" && v !== null ? (v as Record<string, string>) : {};

export interface CrmPerson extends FilterablePerson {
  id: string;
  ownerId: string | null;
  source: string;
  createdAt: string;
  introSentAt: string | null;
  unsubscribed: boolean;
  lastTouchAt: string | null;
  touchCount: number;
}

/** Everyone in the directory with live CRM fields and lead score. */
export async function crmPeople(): Promise<CrmPerson[]> {
  const people = await prisma.outreachPerson.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      memberships: { select: { listId: true } },
      touches: { orderBy: { happenedAt: "desc" }, take: 1, select: { happenedAt: true } },
      _count: { select: { touches: true } },
    },
  });
  const emails = [...new Set(people.map((p) => emailKey(asValues(p.values).email)).filter(Boolean))];

  const [sends, forms, guestRegs, users] = await Promise.all([
    prisma.outreachSend.findMany({ where: { status: "sent" }, select: { personId: true, openedAt: true, clickedAt: true } }),
    prisma.eventFormSubmission.groupBy({ by: ["email"], where: { email: { in: emails, mode: "insensitive" } }, _count: { _all: true } }),
    prisma.registration.groupBy({ by: ["guestEmail"], where: { guestEmail: { in: emails, mode: "insensitive" } }, _count: { _all: true } }),
    prisma.user.findMany({ where: { email: { in: emails, mode: "insensitive" } }, select: { id: true, email: true } }),
  ]);
  const userRegs = users.length
    ? await prisma.registration.groupBy({ by: ["userId"], where: { userId: { in: users.map((u) => u.id) } }, _count: { _all: true } })
    : [];

  const sendStats = new Map<string, { sends: number; opens: number; clicks: number }>();
  for (const s of sends) {
    const st = sendStats.get(s.personId) ?? { sends: 0, opens: 0, clicks: 0 };
    st.sends++; if (s.openedAt) st.opens++; if (s.clickedAt) st.clicks++;
    sendStats.set(s.personId, st);
  }
  const tally = (rows: { key: string | null; n: number }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.key) m.set(r.key.toLowerCase(), (m.get(r.key.toLowerCase()) ?? 0) + r.n);
    return m;
  };
  const formBy = tally(forms.map((f) => ({ key: f.email, n: f._count._all })));
  const regBy = tally(guestRegs.map((r) => ({ key: r.guestEmail, n: r._count._all })));
  const userByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));
  const regByUser = new Map(userRegs.map((r) => [r.userId ?? "", r._count._all]));

  return people.map((p) => {
    const values = asValues(p.values);
    const e = emailKey(values.email);
    const st = sendStats.get(p.id) ?? { sends: 0, opens: 0, clicks: 0 };
    const uid = e ? userByEmail.get(e) : undefined;
    const score = leadScore({
      touches: p._count.touches,
      sends: st.sends, opens: st.opens, clicks: st.clicks,
      forms: e ? formBy.get(e) ?? 0 : 0,
      registrations: (e ? regBy.get(e) ?? 0 : 0) + (uid ? regByUser.get(uid) ?? 0 : 0),
      hasAccount: Boolean(uid),
      unsubscribed: Boolean(p.unsubscribedAt),
      lifecycle: p.lifecycle,
    });
    return {
      id: p.id,
      values,
      lifecycle: p.lifecycle,
      leadStatus: p.leadStatus,
      ownerId: p.ownerId,
      ownerName: p.ownerName,
      source: p.source,
      listIds: p.memberships.map((m) => m.listId),
      score,
      createdAt: p.createdAt.toISOString(),
      introSentAt: p.introSentAt?.toISOString() ?? null,
      unsubscribed: Boolean(p.unsubscribedAt),
      lastTouchAt: p.touches[0]?.happenedAt.toISOString() ?? null,
      touchCount: p._count.touches,
    };
  });
}

export async function smartListMembers(filter: CrmFilter): Promise<CrmPerson[]> {
  return (await crmPeople()).filter((p) => matchesFilter(p, filter));
}

/** The team members a contact, deal or task can be owned by. */
export async function crmOwners(): Promise<{ id: string; name: string }[]> {
  const rows = await prisma.user.findMany({
    where: { role: { in: ["admin", "superadmin"] } },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  return rows.map((u) => ({ id: u.id, name: u.name || u.email }));
}

/**
 * Form → CRM. Called after a real (non-test) submission is saved: creates the
 * contact if the e-mail is new, and logs the submission as a touch either way.
 * Never throws — a CRM hiccup must not fail somebody's form.
 */
export async function captureLead(input: { email?: string | null; name?: string; org?: string; source: string; note: string }): Promise<void> {
  try {
    const key = emailKey(input.email);
    if (!key || !key.includes("@")) return;
    const people = await prisma.outreachPerson.findMany({ select: { id: true, values: true } });
    let id = people.find((p) => emailKey(asValues(p.values).email) === key)?.id;
    if (!id) {
      const created = await prisma.outreachPerson.create({
        data: {
          values: { org: input.org ?? "", name: input.name ?? "", title: "", email: input.email!.trim() },
          addedByName: "Form",
          source: input.source.slice(0, 80),
          lifecycle: "subscriber",
        },
        select: { id: true },
      });
      id = created.id;
    }
    await prisma.outreachTouch.create({
      data: { personId: id, kind: "other", note: input.note.slice(0, 500), byName: "Form" },
    });
  } catch (err) {
    console.warn("[crm] captureLead failed", err);
  }
}

export interface TimelineItem {
  at: string;
  kind: "touch" | "email" | "form" | "registration" | "account" | "task" | "sequence" | "created";
  title: string;
  detail?: string;
  by?: string;
}

/** Everything that happened with one person, newest first. */
export async function timelineFor(personId: string): Promise<TimelineItem[]> {
  const p = await prisma.outreachPerson.findUnique({
    where: { id: personId },
    include: {
      touches: { orderBy: { happenedAt: "desc" }, take: 200 },
      sends: { orderBy: { createdAt: "desc" }, include: { campaign: { select: { name: true } } } },
      tasks: { where: { doneAt: { not: null } }, orderBy: { doneAt: "desc" }, take: 50 },
      enrollments: { include: { sequence: { select: { name: true } } } },
    },
  });
  if (!p) return [];
  const email = asValues(p.values).email?.trim();
  const items: TimelineItem[] = [{ at: p.createdAt.toISOString(), kind: "created", title: "Added to the directory", by: p.addedByName, detail: p.source !== "manual" ? `Source: ${p.source}` : undefined }];

  for (const t of p.touches) {
    // Campaign sends already write a touch; show the richer send row instead.
    if (t.kind === "email" && t.note.startsWith("Campaign “")) continue;
    items.push({ at: t.happenedAt.toISOString(), kind: "touch", title: `${t.kind[0].toUpperCase()}${t.kind.slice(1)}`, detail: t.note, by: t.byName });
  }
  for (const s of p.sends) {
    const flags = [s.openedAt && `opened ${s.opens}×`, s.clickedAt && `clicked ${s.clicks}×`].filter(Boolean).join(" · ");
    items.push({
      at: (s.sentAt ?? s.createdAt).toISOString(),
      kind: "email",
      title: `${s.status === "sent" ? "Email sent" : `Email ${s.status}`} — ${s.campaign.name}`,
      detail: [s.subject, flags || (s.status === "sent" ? "not opened yet" : s.detail)].filter(Boolean).join(" · "),
      by: s.byName,
    });
  }
  for (const t of p.tasks) items.push({ at: t.doneAt!.toISOString(), kind: "task", title: `Task done — ${t.title}`, by: t.assigneeName || t.byName });
  for (const e of p.enrollments) items.push({ at: e.createdAt.toISOString(), kind: "sequence", title: `Enrolled in sequence “${e.sequence.name}”`, detail: e.status, by: e.byName });

  if (email) {
    const [forms, user] = await Promise.all([
      prisma.eventFormSubmission.findMany({
        where: { email: { equals: email, mode: "insensitive" } },
        orderBy: { createdAt: "desc" }, take: 50,
        select: { createdAt: true, form: { select: { title: true } } },
      }),
      prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true, createdAt: true, role: true } }),
    ]);
    for (const f of forms) items.push({ at: f.createdAt.toISOString(), kind: "form", title: `Submitted “${f.form.title}”` });
    const regs = await prisma.registration.findMany({
      where: { OR: [{ guestEmail: { equals: email, mode: "insensitive" } }, ...(user ? [{ userId: user.id }] : [])] },
      orderBy: { createdAt: "desc" }, take: 50,
      select: { createdAt: true, registrationStatus: true, event: { select: { title: true } } },
    });
    for (const r of regs) items.push({ at: r.createdAt.toISOString(), kind: "registration", title: `Registered — ${r.event.title}`, detail: r.registrationStatus });
    if (user) items.push({ at: user.createdAt.toISOString(), kind: "account", title: "Created a platform account", detail: user.role });
  }
  return items.sort((a, b) => b.at.localeCompare(a.at));
}

/** Staff gate + who is acting, shared by every CRM route. */
export async function crmActor() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return null;
  const u = session.user as { id?: string; name?: string; email?: string };
  return { id: u.id ?? null, name: u.name || "BHN team", email: u.email ?? null };
}

/** Slugs of the forms whose submissions add the submitter as a contact (opt-in per form). */
export async function captureFormSlugs(): Promise<string[]> {
  const row = await prisma.platformSetting.findUnique({ where: { key: CRM_CAPTURE_SETTING } }).catch(() => null);
  try {
    const v = row ? JSON.parse(row.value) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch { return []; }
}

/** Form-builder hook: if this form is opted in, capture the submitter. */
export async function captureFormSubmission(form: { slug: string; title: string }, email: string | null, answers: Record<string, unknown>): Promise<void> {
  if (!email || !(await captureFormSlugs()).includes(form.slug)) return;
  const who = guessIdentity(answers);
  await captureLead({ email, ...who, source: `form:${form.slug}`, note: `Submitted form “${form.title}”` });
}
