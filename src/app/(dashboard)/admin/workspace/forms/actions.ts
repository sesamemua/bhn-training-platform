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
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BuiltFormSchema, parseForm, type BuiltForm, type DataSource } from "@/lib/formbuilder/types";
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
