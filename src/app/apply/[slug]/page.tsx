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
import { RichText } from "@/components/forms/RichText";
import { SITE_FONT_VARIABLES } from "./site-fonts";
// Every rule in it is scoped to .bhn-site or [data-theme="bhnsite"], so
// loading it on a route every form shares changes nothing for a form
// that has not asked for the skin.
import "./site-theme.css";

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

  /*
   * How this form looks, as opposed to what it asks.
   *
   * Absent on every form written before it existed — v1 of Training Week
   * among them, with people already registered on it — and every branch
   * below falls through to exactly the markup those forms always had.
   * EventForm.title still names the form in <title>, the admin lists and
   * the "Thank you for registering for…" line; `heading` only changes
   * what the page says at the top.
   */
  const look = doc.presentation;
  const site = look?.theme === "site";
  const heading = look?.heading ?? form.title;
  const intro = look?.intro?.length ? look.intro : undefined;

  return (
    <main
      className={
        site
          ? `bhn-site ${SITE_FONT_VARIABLES} min-h-screen px-6 py-[clamp(3rem,8vw,5rem)]`
          : "min-h-screen bg-page px-4 py-10"
      }
    >
      <div className={FORM_COLUMN}>
        {site ? (
          /*
           * The symposium page's section head, as measured there: a mono
           * eyebrow, a Baskerville title (32px on a phone, 44px from sm),
           * a blue date line and a lede. Face, weight, tracking and case
           * on the h1 come from the global h1 rule reading the skin's
           * --heading-* tokens, which beats any font-* utility put here.
           *
           * No eyebrow over a heading of the form's own: the team's line
           * already opens "BioHubNet Training Week", and the page read
           * "BIOHUBNET / BioHubNet Training Week".
           */
          <header className="mb-2">
            {!look?.heading && (
              <p className="font-mono text-sm font-bold uppercase leading-[1.2] tracking-[0.12em] text-brand-600">
                BioHubNet
              </p>
            )}
            <h1 className={`${look?.heading ? "" : "mt-3.5 "}text-[32px] leading-[1.12] text-fg sm:text-[44px]`}>{heading}</h1>
            {look?.subheading && (
              <p className="mt-4 text-[17px] leading-[1.55] text-[color:var(--bhn-blue-ink)]">{look.subheading}</p>
            )}
            {intro ? (
              <div className="bhn-intro mt-[1.4rem] max-w-[740px] space-y-3.5 text-[18px] leading-[1.45] text-muted sm:text-[20px]">
                {intro.map((p, i) => <p key={i}><RichText text={p} /></p>)}
              </div>
            ) : form.description && (
              <p className="mt-[1.4rem] max-w-[740px] text-[18px] leading-[1.45] text-muted sm:text-[20px]">
                {form.description}
              </p>
            )}
          </header>
        ) : (
          <header className="mb-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-500">BioHubNet</p>
            <h1 className="mt-1 text-[30px] font-bold leading-tight tracking-tight text-fg">{heading}</h1>
            {look?.subheading && (
              <p className="mt-1 text-[14px] font-semibold text-fg">{look.subheading}</p>
            )}
            {/* An intro is paragraphs and labelled links, which a
                description has never been able to hold. It replaces the
                description rather than sitting under it: two summaries of
                one form is one too many. */}
            {intro ? (
              <div className="mt-2 max-w-[62ch] space-y-2 text-[14px] leading-relaxed text-muted">
                {intro.map((p, i) => <p key={i}><RichText text={p} /></p>)}
              </div>
            ) : form.description && (
              <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-muted">{form.description}</p>
            )}
          </header>
        )}

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
