"use server";

import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mailConfigured, sendMail } from "@/lib/mail";
import { printJobPdf } from "./print-store";

const ACTION = "symposium.print.request";
const ROLES = ["admin", "superadmin"];
const Input = z.object({ jobId: z.string().uuid(), recipientId: z.string().min(1).max(150), note: z.string().trim().max(1000), requestId: z.string().uuid() });
const Detail = z.object({ by: z.string(), name: z.string(), to: z.string(), note: z.string(), status: z.enum(["sending", "sent", "unconfirmed"]) });
export type PrintRequestRecord = z.infer<typeof Detail> & { id: string; at: string };

export async function printRequestDetails(jobId: string) {
  if (!await requireRole("admin").catch(() => null)) return { error: "Forbidden", colleagues: [], requests: [] };
  if (!z.string().uuid().safeParse(jobId).success) return { error: "Invalid print batch.", colleagues: [], requests: [] };
  const colleagues = await prisma.user.findMany({
    where: { role: { in: ROLES }, isActive: true, accountKind: "real" },
    select: { id: true, name: true, email: true }, orderBy: [{ name: "asc" }, { email: "asc" }],
  });
  const rows = await prisma.auditLog.findMany({
    where: { action: ACTION, targetType: "printJob", targetId: jobId },
    select: { id: true, detail: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 20,
  });
  const requests: PrintRequestRecord[] = [];
  for (const row of rows) {
    try {
      const parsed = Detail.safeParse(JSON.parse(row.detail ?? "null"));
      if (parsed.success) requests.push({ ...parsed.data, id: row.id, at: row.createdAt.toISOString() });
    } catch { /* Ignore malformed historical audit details. */ }
  }
  return { colleagues, requests };
}

export async function requestPrint(input: unknown) {
  const session = await requireRole("admin").catch(() => null);
  const actor = session?.user as { id?: string; name?: string | null; email?: string | null } | undefined;
  if (!actor?.id) return { error: "Forbidden" };
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { error: "Choose a colleague and keep the note within 1,000 characters." };
  const { jobId, recipientId, note, requestId } = parsed.data;
  if (!mailConfigured()) return { error: "Email is not configured. Copy the colleague link instead." };
  const who = await prisma.user.findFirst({ where: { id: recipientId, role: { in: ROLES }, isActive: true, accountKind: "real" }, select: { name: true, email: true } });
  if (!who || !z.string().email().safeParse(who.email).success) return { error: "Choose an active admin colleague with a valid email address." };
  const saved = await printJobPdf(jobId);
  if (!saved || saved.job.status !== "ready") return { error: "This batch is no longer ready to print. Refresh Print Jobs." };
  const job = saved.job;
  const by = actor.name || actor.email || "A BioHubNet colleague";
  const detail = { by, name: who.name || who.email, to: who.email, note, status: "sending" };
  // Claim the request before SMTP so replaying the same action cannot send it twice.
  try {
    await prisma.auditLog.create({ data: { id: requestId, actorId: actor.id, action: ACTION, targetType: "printJob", targetId: jobId, detail: JSON.stringify(detail) } });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return { error: "This request was already submitted. Check its history before sending another." };
    throw error;
  }
  const link = `${(process.env.NEXTAUTH_URL ?? "https://bhn-training-platform.vercel.app").replace(/\/$/, "")}/print-job/${jobId}`;
  const stock = job.kind === "badges" ? `Avery 5393, Letter, 100% actual size. ${job.badges.length - job.printedIds.length} badges remain unprinted; check the batch before printing.` : `Letter paper, ${job.copies} copies already included in the PDF. Print the PDF once, single-sided, at 100% actual size.`;
  try {
    await sendMail({
      to: who.email, replyTo: actor.email ?? undefined, signature: false,
      subject: `Print request from ${by}: ${job.label}`.replace(/[\r\n]+/g, " "),
      text: `Hello ${who.name || "there"},\n\n${by} would like you to print:\n${job.label}\n\n${stock}\n${job.kind === "tents" ? "Fold each sheet in half along the centre guide, with both faces pointing outwards.\n" : ""}${job.notes ? `\nBatch notes:\n${job.notes}\n` : ""}${note ? `\nNote from ${by}:\n${note}\n` : ""}\nOpen the shared batch:\n${link}\n\nSign in with your training platform account to preview and download the PDF. Check the batch is still ready before printing; afterwards, confirm what you printed on that page. Sending this request does not mark anything printed.`,
      log: { kind: ACTION, byName: by },
    });
  } catch (error) {
    console.error("Print request email failed", error);
    await prisma.auditLog.update({ where: { id: requestId }, data: { detail: JSON.stringify({ ...detail, status: "unconfirmed" }) } }).catch(() => undefined);
    return { error: "Email delivery could not be confirmed. Check with the colleague before trying again." };
  }
  const record: PrintRequestRecord = { ...detail, status: "sent", id: requestId, at: new Date().toISOString() };
  try { await prisma.auditLog.update({ where: { id: requestId }, data: { detail: JSON.stringify({ ...detail, status: "sent" }) } }); }
  catch { return { sent: record, warning: "Email sent, but its delivery status could not be saved in the history. Do not resend." }; }
  return { sent: record };
}
