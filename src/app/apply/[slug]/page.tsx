/**
 * The public registration form.
 *
 * Open to anyone with the link and NO SIGN-IN. That is a deliberate
 * consequence of the eligibility rule: an EQUIP applicant qualifies by
 * having submitted an application, and EQUIP does not use the training
 * platform — so requiring an account here would shut out exactly the
 * people question one was rewritten to let in.
 *
 * Its own route rather than a page inside the dashboard: this is the
 * URL that goes on the Luma page, in emails and on biohubnet.ca, and it
 * must not sit behind a layout that assumes somebody is signed in.
 */
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseForm } from "@/lib/formbuilder/types";
import { FORM_COLUMN } from "@/lib/formbuilder/layout";
import { PublicForm } from "@/components/forms/PublicForm";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const form = await prisma.eventForm.findUnique({
    where: { slug },
    select: { title: true, description: true, active: true },
  });
  if (!form) return { title: "Not found" };
  return {
    title: form.title,
    description: form.description ?? undefined,
    // Not a page for search engines to hold on to: it opens and closes,
    // and a stale result sending somebody to a closed form is worse
    // than no result.
    robots: { index: false, follow: false },
  };
}

export default async function PublicFormPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const form = await prisma.eventForm.findUnique({
    where: { slug },
    select: { id: true, slug: true, title: true, description: true, active: true, fields: true },
  });
  if (!form) notFound();

  const doc = parseForm(form.fields);

  return (
    <main className="min-h-screen bg-page px-4 py-10">
      <div className={FORM_COLUMN}>
        <header className="mb-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-500">BioHubNet</p>
          <h1 className="mt-1 text-[30px] font-bold leading-tight tracking-tight text-fg">{form.title}</h1>
          {form.description && (
            <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-muted">{form.description}</p>
          )}
        </header>

        {form.active ? (
          <PublicForm slug={form.slug} title={form.title} doc={doc} />
        ) : (
          /*
           * Closed is said plainly, and the questions are not drawn.
           * A form you can fill in and cannot submit wastes somebody's
           * ten minutes and then tells them.
           */
          <div className="mt-6 rounded-2xl border-2 border-line-strong bg-card p-6">
            <p className="text-[15px] font-semibold text-fg">Registration is closed.</p>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
              This form is not taking registrations at the moment. If you think it should be,
              email the BioHubNet team and they will look into it.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
