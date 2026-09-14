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
import { Prisma } from "@prisma/client";
import { getSession, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BuiltFormSchema, parseForm, type BuiltForm, type DataSource } from "@/lib/formbuilder/types";
import { copyForVersion, copyProblem, nextVersionSlug, versionNumber, versionedTitle } from "@/lib/formbuilder/versions";
import { REGISTRATION_FORM_SLUGS } from "@/lib/allocation/symposium-2026";
import { SITE_THEMED_FORM_SLUGS } from "@/lib/formbuilder/site-theme";
import { checkSubmission, emailFrom } from "@/lib/formbuilder/submit";
import { sendAcknowledgement } from "@/lib/formbuilder/acknowledge";
import { makeSeats } from "@/lib/formbuilder/seats";
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
 * Open a closed form to the public.
 *
 * Open only. A new version starts closed and this is how it comes to
 * take registrations. There is deliberately no close beside it: one
 * mis-click there would shut the live registration form, and Delete
 * already closes a form that has registrations instead of deleting it.
 */
export async function openForm(id: string) {
  await requireAdmin();
  const form = await prisma.eventForm.findUnique({ where: { id }, select: { slug: true } });
  if (!form) return { ok: false as const, problem: "That form no longer exists." };

  await prisma.eventForm.update({ where: { id }, data: { active: true } });
  revalidatePath(PAGE);
  // The public page and the Training Week one both read `active`.
  revalidatePath(`/apply/${form.slug}`);
  revalidatePath("/admin/workspace/symposium-2026/registration");
  return { ok: true as const, slug: form.slug };
}

/**
 * Copy a form into a new version beside it.
 *
 * For changing a form people have already registered on without moving
 * it under them. The copy takes the questions, logic, workflow and
 * presentation. It never takes the registrations, and it starts CLOSED:
 * an open draft is a draft somebody can register on while it is still
 * being changed.
 */
export async function duplicateFormAsVersion(id: string) {
  await requireAdmin();
  const source = await prisma.eventForm.findUnique({
    where: { id },
    select: { slug: true, title: true, description: true, fields: true },
  });
  if (!source) return { ok: false as const, problem: "That form no longer exists." };

  // Through the same gates as a save, so what is stored is what the
  // builder showed for the original.
  const doc = copyForVersion(source.fields);
  if (!doc) return { ok: false as const, problem: "That form could not be read." };
  // A copy quietly missing questions is worse than no copy: it is
  // reported as made. Old-editor forms read as empty, so they stop here too.
  const unreadable = copyProblem(source.fields, doc);
  if (unreadable) return { ok: false as const, problem: unreadable };

  // Slugs code has already claimed count as taken before their row
  // exists. A plain copy of v1 must not land on the -v2 that the site
  // theme, the pooled registrant sheet and the v2 build script expect.
  const taken = [
    ...(await prisma.eventForm.findMany({ select: { slug: true } })).map((f) => f.slug),
    ...REGISTRATION_FORM_SLUGS,
    ...SITE_THEMED_FORM_SLUGS,
  ];
  const slug = nextVersionSlug(source.slug, taken);

  try {
    const row = await prisma.eventForm.create({
      data: {
        slug,
        title: versionedTitle(source.title, versionNumber(slug)),
        description: source.description,
        fields: doc as unknown as object,
        active: false,
      },
      select: { id: true, slug: true, title: true, active: true, fields: true, updatedAt: true },
    });
    revalidatePath(PAGE);
    // The shape loadForms returns, so the picker can select the copy
    // the moment this answers rather than after the page refreshes.
    return {
      ok: true as const,
      form: {
        id: row.id,
        slug: row.slug,
        title: row.title,
        active: row.active,
        doc: parseForm(row.fields),
        updatedAt: row.updatedAt.toISOString(),
      },
    };
  } catch (e) {
    // Two people duplicating the same form at once reach for the same
    // slug, and the unique index lets one of them have it.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false as const, problem: "Another version was made at the same moment. Try again." };
    }
    throw e;
  }
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

  await makeSeats(doc, verdict.clean, row.id, user?.id ?? null);

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
  /*
   * A TEST goes to the person running it, never to the address typed
   * into the form. Trying the form out must not be able to write to a
   * stranger.
   */
  const receipt = await sendAcknowledgement(doc, verdict.clean, {
    to: opts?.test ? ((user as { email?: string } | undefined)?.email ?? null) : emailFrom(doc, verdict.clean),
    asTest: opts?.test === true,
  });

  return { ok: true, id: row.id, receipt };
}
