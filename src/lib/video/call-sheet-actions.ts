"use server";

/**
 * Call sheet CRUD, scoped to a video project. Each action re-checks the
 * role: a server action is a public endpoint, whatever page calls it.
 */
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { blankCallSheet, CallSheetInputSchema, parseCallSheetData, type CallSheetInput } from "@/lib/video/call-sheet";
import { callSheetsPath } from "@/lib/video/paths";

async function requireAdmin() {
  const session = await requireRole("admin");
  return session.user as { id?: string };
}

const toDate = (d: string) => (d ? new Date(`${d}T00:00:00Z`) : null);

type Result = { ok: true; id: string } | { ok: false; error: string };

export async function createCallSheet(projectId: string): Promise<Result> {
  const me = await requireAdmin();
  const project = await prisma.videoProject.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return { ok: false, error: "That project no longer exists." };
  const blank = blankCallSheet();
  const row = await prisma.callSheet.create({
    data: { projectId, title: blank.title, shootDate: null, data: blank.data as object, createdById: me.id ?? null },
    select: { id: true },
  });
  revalidatePath(callSheetsPath(projectId));
  return { ok: true, id: row.id };
}

export async function duplicateCallSheet(id: string): Promise<Result> {
  const me = await requireAdmin();
  const src = await prisma.callSheet.findUnique({ where: { id } });
  if (!src) return { ok: false, error: "That call sheet no longer exists." };
  const row = await prisma.callSheet.create({
    data: {
      projectId: src.projectId,
      title: `${src.title} (copy)`.slice(0, 160),
      shootDate: src.shootDate,
      data: parseCallSheetData(src.data) as object,
      createdById: me.id ?? null,
    },
    select: { id: true },
  });
  if (src.projectId) revalidatePath(callSheetsPath(src.projectId));
  return { ok: true, id: row.id };
}

export async function updateCallSheet(id: string, input: CallSheetInput): Promise<Result> {
  await requireAdmin();
  const parsed = CallSheetInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Some of that could not be saved." };
  const { title, shootDate, data } = parsed.data;
  const row = await prisma.callSheet.findUnique({ where: { id }, select: { projectId: true } });
  if (!row) return { ok: false, error: "That call sheet no longer exists." };
  await prisma.callSheet.update({ where: { id }, data: { title, shootDate: toDate(shootDate), data: data as object } });
  if (row.projectId) {
    revalidatePath(callSheetsPath(row.projectId));
    revalidatePath(`${callSheetsPath(row.projectId)}/${id}`);
  }
  return { ok: true, id };
}

export async function deleteCallSheet(id: string): Promise<{ ok: true }> {
  await requireAdmin();
  const row = await prisma.callSheet.findUnique({ where: { id }, select: { projectId: true } });
  await prisma.callSheet.deleteMany({ where: { id } });
  if (row?.projectId) revalidatePath(callSheetsPath(row.projectId));
  return { ok: true };
}
