import "server-only";

/**
 * The "we have your registration" letter, sent from one place.
 *
 * Both submit paths — the coordinator testing from Admin and a
 * registrant on the public page — send the SAME letter, because
 * "what the test sent" and "what a registrant gets" being different
 * makes the test worthless.
 *
 * The wording is the `received` template, edited under Admin → Email →
 * Standing letters. A coordinator who changes the turnaround there and
 * finds registrants still being told the old number would rightly never
 * trust the editor again.
 */
import { prisma } from "@/lib/prisma";
import { mailConfigured, sendMail } from "@/lib/mail";
import { parseOverrides, render, resolveTemplates, TEMPLATES_KEY } from "@/lib/allocation/email-templates";
import type { Answers } from "./logic";
import type { Receipt } from "./receipt";
import type { BuiltForm } from "./types";

export async function sendAcknowledgement(
  doc: BuiltForm,
  answers: Answers,
  opts: { to: string | null; asTest?: boolean },
): Promise<Receipt> {
  if (!opts.to) return { state: "no-address" };

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
  // A letter with an unfilled placeholder is worse than no letter: it
  // is the platform telling somebody it does not know who they are.
  if (subject.missing.length > 0 || body.missing.length > 0) {
    return { state: "unfilled", missing: [...new Set([...subject.missing, ...body.missing])] };
  }

  const preview = {
    to: opts.to,
    // A newline in a subject is a header break, and the name in it came
    // from a text box on a page anybody can open.
    subject: subject.text.replace(/[\r\n]+/g, " ").trim(),
    body: body.text,
  };
  if (!mailConfigured()) return { state: "not-configured", preview };

  try {
    await sendMail({ to: opts.to, subject: preview.subject, text: preview.body });
    return { state: opts.asTest ? "sent-to-you" : "sent", preview };
  } catch (err) {
    // The row is already written. A registration is not lost because
    // the mail server is having a bad afternoon.
    return { state: "failed", why: (err as Error)?.message ?? "unknown", preview };
  }
}
