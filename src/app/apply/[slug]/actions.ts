"use server";

/**
 * Taking a registration from someone who is not signed in.
 *
 * The only guarded thing about this endpoint is that it can only write
 * a submission — so everything else has to be checked here: that the
 * form exists and is open, that the answers are answers to questions
 * that were actually asked, and that a script cannot fill it in four
 * hundred times.
 *
 * Separate from the admin action on purpose. That one can file a TEST
 * submission; this one must never be able to, or the marker that lets a
 * coordinator clear their own rows in bulk becomes something anybody
 * can set.
 */
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { parseForm } from "@/lib/formbuilder/types";
import { checkSubmission, emailFrom } from "@/lib/formbuilder/submit";
import { checkEligibility, BLOCKED_MESSAGE } from "@/lib/eligibility/check";
import { sendAcknowledgement } from "@/lib/formbuilder/acknowledge";
import { makeSeats } from "@/lib/formbuilder/seats";
import { since, tooMany } from "@/lib/formbuilder/throttle";
import type { Receipt } from "@/lib/formbuilder/receipt";
import type { Answers } from "@/lib/formbuilder/logic";

export async function submitPublicForm(
  slug: string,
  answers: Record<string, unknown>,
): Promise<{ ok: boolean; problems?: string[]; receipt?: Receipt }> {
  const form = await prisma.eventForm.findUnique({ where: { slug } });
  if (!form) return { ok: false, problems: ["That form no longer exists."] };
  if (!form.active) return { ok: false, problems: ["Registration is closed."] };

  const doc = parseForm(form.fields);
  const verdict = checkSubmission(doc, answers as Answers);
  if (!verdict.ok) return { ok: false, problems: verdict.problems };

  const email = emailFrom(doc, verdict.clean);
  const from = since(new Date());
  const [byEmail, total] = await Promise.all([
    email
      ? prisma.eventFormSubmission.count({ where: { formId: form.id, email, createdAt: { gte: from } } })
      : Promise.resolve(0),
    prisma.eventFormSubmission.count({ where: { formId: form.id, createdAt: { gte: from } } }),
  ]);
  const stop = tooMany({ byEmail, total });
  if (stop) return { ok: false, problems: [stop] };

  /*
   * The eligibility check, on the server, because the form's own copy
   * of it is a courtesy and this action is a public endpoint.
   *
   * Matched on the address registered with the programme, which is a
   * different question from the address they want us to write to —
   * emailFrom prefers `email` and would never fall through to it.
   */
  const registered = typeof verdict.clean.trainee_email === "string"
    ? verdict.clean.trainee_email
    : null;
  const eligibility = registered ? await checkEligibility(registered) : null;
  if (eligibility?.blocked) {
    return { ok: false, problems: [BLOCKED_MESSAGE] };
  }

  const row = await prisma.eventFormSubmission.create({
    data: {
      formId: form.id,
      // No __test marker is set here, and nothing in the payload can
      // add one: only the fields the form asks about survive
      // checkSubmission, and __test is not a question.
      /*
       * The verdict is written here, server-side, next to the answers.
       * A reserved key rather than a column: it answers "why was she
       * refused last Tuesday" without a migration, and nothing in the
       * payload can forge it — only fields the form asks about survive
       * checkSubmission, and these are not questions.
       */
      data: {
        ...(verdict.clean as object),
        ...(eligibility
          ? {
              __eligibility: eligibility.matched ? "matched" : "not_matched",
              __eligibilityAt: new Date().toISOString(),
              __eligibilitySources: eligibility.sourceIds,
            }
          : {}),
      } as object,
      email,
      userId: null,
    },
    select: { id: true },
  });

  // The seats they asked for, pending a decision. Asking for a session
  // is not being given one.
  await makeSeats(doc, verdict.clean, row.id, null);
  revalidatePath("/admin/workspace/training-admin");

  const receipt = await sendAcknowledgement(doc, verdict.clean, { to: email });
  return { ok: true, receipt };
}
