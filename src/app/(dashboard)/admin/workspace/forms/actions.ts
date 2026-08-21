"use server";

/**
 * Server actions for the form builder.
 *
 * Forms live in the existing EventForm table — slug, title, and a JSON
 * `fields` column that carries the whole document, workflow included.
 * No new table: this database is production, and a feature that fits
 * what is already there should.
 */
import { revalidatePath } from "next/cache";
import { getSession, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BuiltFormSchema, parseForm, type BuiltForm, type DataSource } from "@/lib/formbuilder/types";
import { checkSubmission, emailFrom } from "@/lib/formbuilder/submit";
import { mailConfigured, sendMail } from "@/lib/mail";
import {
  parseOverrides, render, resolveTemplates, TEMPLATES_KEY,
} from "@/lib/allocation/email-templates";
import type { Receipt } from "@/lib/formbuilder/receipt";
import type { Answers } from "@/lib/formbuilder/logic";
import { parseCsv } from "@/lib/formbuilder/csv";

const PAGE = "/admin/workspace/forms";

async function requireAdmin() {
  const session = await requireRole("admin");
  return session.user as { id?: string };
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "form";

export async function createForm(title: string) {
  await requireAdmin();
  const clean = title.trim().slice(0, 120) || "Untitled form";
  const base = slugify(clean);
  const taken = new Set((await prisma.eventForm.findMany({ select: { slug: true } })).map((f) => f.slug));
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;

  const row = await prisma.eventForm.create({
    data: { slug, title: clean, fields: { version: 1, fields: [], sources: [], steps: [] } },
  });
  revalidatePath(PAGE);
  return { ok: true as const, id: row.id };
}

export async function saveForm(id: string, doc: BuiltForm) {
  await requireAdmin();
  // Re-parsed on the way in. A server action receives whatever the
  // caller sends, and this blob is executed later to decide what a
  // person is shown.
  const parsed = BuiltFormSchema.safeParse(doc);
  if (!parsed.success) return { ok: false as const, problem: "That form could not be read." };

  await prisma.eventForm.update({
    where: { id },
    data: { fields: parsed.data as unknown as object },
  });
  revalidatePath(PAGE);
  return { ok: true as const };
}

export async function renameForm(id: string, title: string) {
  await requireAdmin();
  await prisma.eventForm.update({ where: { id }, data: { title: title.trim().slice(0, 120) || "Untitled form" } });
  revalidatePath(PAGE);
  return { ok: true as const };
}

export async function deleteForm(id: string) {
  await requireAdmin();
  const submissions = await prisma.eventFormSubmission.count({ where: { formId: id } });
  if (submissions > 0) {
    // Deleting would take the answers with it. Retired instead — the
    // same reasoning as a workshop with bookings.
    await prisma.eventForm.update({ where: { id }, data: { active: false } });
    revalidatePath(PAGE);
    return { ok: true as const, deactivated: true, submissions };
  }
  await prisma.eventForm.delete({ where: { id } });
  revalidatePath(PAGE);
  return { ok: true as const, deactivated: false, submissions: 0 };
}

/**
 * Read a Google Sheet published as CSV, so a question can offer its rows.
 *
 * Deliberately narrow: only Google Sheets, only over https, and only the
 * `gviz` CSV endpoint. A field that fetches an arbitrary URL chosen by
 * whoever is editing is a request-forgery hole pointed at the inside of
 * the network, and "the admin typed it" is not a defence.
 */
export async function readSheet(url: string): Promise<Partial<DataSource> & { problem?: string }> {
  await requireAdmin();

  const id = sheetIdOf(url);
  if (!id) {
    return { problem: "That does not look like a Google Sheets link. Paste the URL from the browser's address bar." };
  }
  const endpoint = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv`;

  try {
    const res = await fetch(endpoint, {
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
      headers: { accept: "text/csv" },
    });
    if (!res.ok) {
      return {
        problem:
          res.status === 404
            ? "That sheet was not found. Check the link."
            : "That sheet is not readable. In Sheets, use Share → Anyone with the link → Viewer.",
      };
    }
    const text = (await res.text()).slice(0, 500_000);
    if (text.trimStart().startsWith("<")) {
      return { problem: "That sheet is not shared. Use Share → Anyone with the link → Viewer." };
    }
    const table = parseCsv(text);
    if (table.length === 0) return { problem: "That sheet is empty." };

    const [head, ...rest] = table;
    return {
      columns: head.map((h) => h.trim()).filter(Boolean),
      rows: rest.slice(0, 500),
      fetchedAt: new Date().toISOString(),
      error: undefined,
    };
  } catch {
    return { problem: "Could not reach that sheet — it may be private, or the request timed out." };
  }
}

/** The document id out of any of the shapes a Sheets URL comes in. */
function sheetIdOf(url: string): string | null {
  if (!/^https:\/\/docs\.google\.com\/spreadsheets\//i.test(url.trim())) return null;
  const m = url.match(/\/spreadsheets\/d\/(?:e\/)?([a-zA-Z0-9-_]{20,})/);
  return m ? m[1] : null;
}

export async function loadForms() {
  await requireAdmin();
  const rows = await prisma.eventForm.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, slug: true, title: true, active: true, fields: true, updatedAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    active: r.active,
    doc: parseForm(r.fields),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/* ── submitting a built form ──────────────────────────────────────── */

/**
 * Record a real submission against a built form.
 *
 * Every rule the fill view enforces is checked again here. The
 * browser's copy is a courtesy to whoever is filling the form in; this
 * is a public endpoint, and a cap that only exists in a disabled button
 * is not a cap.
 *
 * `test` marks a submission made from the admin preview, so a
 * coordinator can try the form end to end and then clear what they
 * left behind without picking their own rows out of real ones by eye.
 */
export async function submitBuiltForm(
  slug: string,
  answers: Record<string, unknown>,
  opts?: { test?: boolean },
): Promise<{ ok: boolean; problems?: string[]; id?: string; receipt?: Receipt }> {
  const form = await prisma.eventForm.findUnique({ where: { slug } });
  if (!form) return { ok: false, problems: ["That form no longer exists."] };
  if (!form.active && !opts?.test) {
    return { ok: false, problems: ["This form is not accepting submissions."] };
  }

  const doc = parseForm(form.fields);
  const verdict = checkSubmission(doc, answers as Answers);
  if (!verdict.ok) return { ok: false, problems: verdict.problems };

  // A test submission is admin-only. Without this anybody could file
  // rows that a coordinator has been told are safe to delete in bulk.
  const session = await getSession();
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (opts?.test && !["admin", "superadmin", "instructor"].includes(user?.role ?? "")) {
    return { ok: false, problems: ["Only staff can file a test submission."] };
  }

  const row = await prisma.eventFormSubmission.create({
    data: {
      formId: form.id,
      data: { ...verdict.clean, ...(opts?.test ? { __test: true } : {}) } as object,
      email: emailFrom(doc, verdict.clean),
      userId: user?.id ?? null,
    },
    select: { id: true },
  });

  revalidatePath("/admin/workspace/symposium-2026/registration");
  revalidatePath("/admin/workspace/training-admin");

  /*
   * The acknowledgement, AFTER the row exists.
   *
   * A registration is not lost because the mail server is having a bad
   * afternoon. The row is the record; the letter is a courtesy, and it
   * reports what happened rather than taking the submission down with
   * it.
   */
  const receipt = await acknowledge(doc, verdict.clean, {
    test: opts?.test === true,
    adminEmail: (user as { email?: string } | undefined)?.email ?? null,
  });

  return { ok: true, id: row.id, receipt };
}

/**
 * Send the "we have your registration" letter.
 *
 * The wording is the `received` template, edited under Admin → Email →
 * Standing letters — not a second copy living in this file. A
 * coordinator who changes the turnaround there and finds registrants
 * still being told the old number would rightly never trust the editor
 * again.
 *
 * A TEST submission is sent to the person running the test, never to
 * the address typed into the form. Trying the form out must not be able
 * to write to a stranger.
 */
async function acknowledge(
  doc: BuiltForm,
  answers: Answers,
  opts: { test: boolean; adminEmail: string | null },
): Promise<Receipt> {
  const to = opts.test ? opts.adminEmail : emailFrom(doc, answers);
  if (!to) return { state: "no-address" };

  const stored = await prisma.platformSetting
    .findUnique({ where: { key: TEMPLATES_KEY } })
    .catch(() => null);
  const template = resolveTemplates(parseOverrides(stored?.value)).find((t) => t.id === "received");
  if (!template) return { state: "no-template" };

  const name = String(answers.first_name ?? answers.trainee_name ?? "").trim();
  const vars = {
    first_name: name.split(/\s+/)[0] || "there",
    name: name || "there",
    event: "BioHubNet Training Week 2026",
    coordinator: "The BioHubNet team",
  };
  const subject = render(template.subject, vars);
  const body = render(template.body, vars);
  // A letter with an unfilled placeholder in it is worse than no letter:
  // it is the platform telling somebody it does not know who they are.
  if (subject.missing.length > 0 || body.missing.length > 0) {
    return { state: "unfilled", missing: [...new Set([...subject.missing, ...body.missing])] };
  }

  const preview = { to, subject: subject.text.replace(/[\r\n]+/g, " ").trim(), body: body.text };
  if (!mailConfigured()) return { state: "not-configured", preview };

  try {
    await sendMail({ to, subject: preview.subject, text: preview.body });
    return { state: opts.test ? "sent-to-you" : "sent", preview };
  } catch (err) {
    return { state: "failed", why: (err as Error)?.message ?? "unknown", preview };
  }
}
