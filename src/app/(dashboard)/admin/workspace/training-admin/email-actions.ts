"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { REGISTRATION_FORM_SLUG, REGISTRATION_FORM_WHERE } from "@/lib/allocation/symposium-2026";
import { INNOVATION_IGNITED_SLUG } from "@/lib/formbuilder/innovation-ignited";
import { versionRoot } from "@/lib/formbuilder/versions";

const Input = z.object({ id: z.string().min(1).max(100), email: z.string().trim().toLowerCase().max(254).pipe(z.email()) });

export async function addRegistrantEmail(id: string, email: string): Promise<{ ok: boolean; problem?: string }> {
  const session = await requireRole("admin").catch(() => null);
  const actorId = (session?.user as { id?: string } | undefined)?.id;
  if (!actorId) return { ok: false, problem: "Admin access required." };
  const parsed = Input.safeParse({ id, email });
  if (!parsed.success) return { ok: false, problem: "Enter a valid email address." };
  try {
    const result = await prisma.$transaction(async tx => {
      const row = await tx.eventFormSubmission.findUnique({ where: { id }, select: { id: true, email: true, data: true, form: { select: { slug: true } }, user: { select: { email: true } } } });
      if (!row || (versionRoot(row.form.slug) !== REGISTRATION_FORM_SLUG && row.form.slug !== INNOVATION_IGNITED_SLUG)) return { ok: false, problem: "Workshop registration not found." };
      const data = row.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data as Record<string, unknown> : null;
      if (!data) return { ok: false, problem: "This registration needs review before it can be changed." };
      if (row.email?.trim() || row.user?.email?.trim() || (typeof data.trainee_email === "string" && data.trainee_email.trim())) return { ok: false, problem: "An email address is already recorded. Refresh to see it." };
      const duplicate = await tx.eventFormSubmission.findFirst({ where: { id: { not: id }, email: { equals: parsed.data.email, mode: "insensitive" }, form: { OR: [REGISTRATION_FORM_WHERE, { slug: INNOVATION_IGNITED_SLUG }] } }, select: { id: true } });
      if (duplicate) return { ok: false, problem: "This email is already on another workshop registration. Check for a duplicate person before adding it." };
      const changed = await tx.eventFormSubmission.updateMany({ where: { id, email: row.email, data: { equals: row.data as import("@prisma/client").Prisma.InputJsonObject } }, data: { email: parsed.data.email, data: { ...data, trainee_email: parsed.data.email } as import("@prisma/client").Prisma.InputJsonObject } });
      if (changed.count !== 1) return { ok: false, problem: "A colleague changed this registration. Refresh before trying again." };
      await tx.auditLog.create({ data: { actorId, action: "training_admin.email_added", detail: JSON.stringify({ submissionId: id, from: row.email, to: parsed.data.email, reason: "Admin supplied a missing workshop registrant email", sentEmail: false }) } });
      return { ok: true };
    });
    if (result.ok) { revalidatePath("/admin/workspace/training-admin"); revalidatePath("/dashboard"); }
    return result;
  } catch { return { ok: false, problem: "Couldn't save the email address. Please retry." }; }
}
