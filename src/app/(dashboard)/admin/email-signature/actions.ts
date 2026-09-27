"use server";

/**
 * Save or reset the email signature.
 *
 * Admin-only, and written to the audit log with the wording it replaced:
 * this text goes out under every message the platform sends, so a change
 * to it should be traceable to a person and undoable from the record.
 */
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { forgetSignature } from "@/lib/mail";
import { cleanSignature, DEFAULT_SIGNATURE, SIGNATURE_KEY, signatureProblem } from "@/lib/mail-signature";

const PAGE = "/admin/email-signature";

async function admin() {
  return (await requireRole("admin")) as { user: { id?: string } };
}

async function audit(actorId: string | undefined, action: string, detail: unknown) {
  if (!actorId) return;
  await prisma.auditLog.create({ data: { action, actorId, detail: JSON.stringify(detail) } }).catch(() => null);
}

export async function saveSignature(raw: string): Promise<{ ok: boolean; problem?: string; signature?: string }> {
  const me = await admin();
  const problem = signatureProblem(String(raw ?? ""));
  if (problem) return { ok: false, problem };
  const text = cleanSignature(raw);

  const before = await prisma.platformSetting.findUnique({ where: { key: SIGNATURE_KEY } });
  // The shipped wording is stored as NOTHING, so a later change to the
  // default reaches everybody who never edited theirs.
  if (text === DEFAULT_SIGNATURE) {
    await prisma.platformSetting.deleteMany({ where: { key: SIGNATURE_KEY } });
  } else {
    await prisma.platformSetting.upsert({
      where: { key: SIGNATURE_KEY },
      create: { key: SIGNATURE_KEY, value: text },
      update: { value: text },
    });
  }
  await audit(me.user.id, "mail.signature_saved", { before: before?.value ?? null, after: text });
  forgetSignature();
  revalidatePath(PAGE);
  return { ok: true, signature: text };
}

export async function resetSignature(): Promise<{ ok: boolean; signature: string }> {
  const me = await admin();
  const before = await prisma.platformSetting.findUnique({ where: { key: SIGNATURE_KEY } });
  await prisma.platformSetting.deleteMany({ where: { key: SIGNATURE_KEY } });
  await audit(me.user.id, "mail.signature_reset", { before: before?.value ?? null });
  forgetSignature();
  revalidatePath(PAGE);
  return { ok: true, signature: DEFAULT_SIGNATURE };
}
