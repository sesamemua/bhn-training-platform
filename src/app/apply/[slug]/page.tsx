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
import { columnFor } from "@/lib/formbuilder/layout";
import { PublicForm } from "@/components/forms/PublicForm";
import { RichText } from "@/components/forms/RichText";
import { SiteFooter, SiteFormSection, SiteHeader, SiteHero } from "@/components/forms/SiteChrome";
import { SITE_FONT_VARIABLES } from "./site-fonts";
// Every rule in it is scoped to .bhn-site or [data-theme="bhnsite"], so
// loading it on a route every form shares changes nothing for a form
// that has not asked for the skin.
import "./site-theme.css";

import { parseSwitch, publicNotice, REGISTRATION_STATE_KEY } from "@/lib/registration/state";

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
   * Closed, or only paused?
   *
   * `active` says whether anybody may register; the switch says which
   * of the two it is, and a registrant told "closed" while somebody
   * pauses for ten minutes has been told the wrong thing. Read only
   * when the form is not taking registrations — an open form has
   * nothing to say about it.
   */
  const stop = form.active
    ? null
    : publicNotice(
        parseSwitch(
          (await prisma.platformSetting.findUnique({ where: { key: REGISTRATION_STATE_KEY } }))?.value,
          "closed",
        ).state,
      ) ?? publicNotice("closed");

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

  const questions = !stop ? (
    <PublicForm slug={form.slug} title={form.title} doc={doc} />
  ) : (
    /*
     * Said plainly, and the questions are not drawn. A form you can
     * fill in and cannot submit wastes somebody's ten minutes and then
     * tells them.
     */
    <div className="mt-6 rounded-2xl border-2 border-line-strong bg-card p-6">
      <p className="text-[15px] font-semibold text-fg">{stop.title}</p>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{stop.body}</p>
    </div>
  );

  if (site) {
    /*
     * The symposium page around the form: its header, its photo hero
     * carrying the heading, buttons and facts, the questions on its
     * blue-glass ground, and its footer. The skin and the faces go on a
     * wrapper rather than <main>, so the header and footer can sit
     * outside <main> as landmarks should and still get both.
     */
    return (
      <div className={`bhn-site bhn-chrome ${SITE_FONT_VARIABLES}`}>
        <SiteHeader homeLink={look?.homeLink} />
        <main>
          <SiteHero
            heading={heading}
            subheading={look?.subheading}
            intro={intro}
            description={form.description}
            actions={look?.actions}
            facts={look?.facts}
          />
          <SiteFormSection label={form.title} intro={look?.formIntro} column={columnFor(doc)}>
            {questions}
          </SiteFormSection>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-page px-4 py-10">
      {/* The header shares the form's column, so the title and the
          questions keep one left edge. */}
      <div className={columnFor(doc)}>
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

        {questions}
      </div>
    </main>
  );
}
