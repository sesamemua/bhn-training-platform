/**
 * Outreach unsubscribe — the link in the footer of every email we send.
 *
 * Public and unauthenticated by necessity: a partner organisation has no
 * platform account, and CASL requires the mechanism to work for 60 days after
 * the message without them having to ask anyone. The signed token is what
 * stands in for a login — it is derived from the person id, so the link cannot
 * be guessed and one link only ever opts out one contact.
 *
 * Opting out is recorded on the person, not the campaign, so it holds across
 * every list and every future campaign.
 */
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyUnsubscribeToken, OUTREACH_SENDER_BLOCK } from "@/lib/outreach/send";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Unsubscribe · BioHubNet",
  robots: { index: false, follow: false },
};

export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ personId: string; token: string }>;
}) {
  const { personId, token } = await params;
  if (!verifyUnsubscribeToken(personId, token)) notFound();

  const person = await prisma.outreachPerson.findUnique({
    where: { id: personId },
    select: { id: true, values: true, unsubscribedAt: true },
  });
  if (!person) notFound();

  // Opting out happens on load rather than behind a button. A one-click
  // unsubscribe is what CASL expects, and mail clients that prefetch links
  // should land people in the state they asked for, not a form they must
  // find again.
  const already = person.unsubscribedAt;
  if (!already) {
    await prisma.outreachPerson.update({
      where: { id: personId },
      data: { unsubscribedAt: new Date() },
    });
  }

  const values = (person.values ?? {}) as Record<string, unknown>;
  const email = typeof values.email === "string" ? values.email : "";

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-6 py-16">
      <div className="rounded-2xl border border-line bg-card p-8">
        <h1 className="text-xl font-bold text-fg">You&apos;ve been unsubscribed</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {email ? (
            <>
              We won&apos;t send further outreach to{" "}
              <span className="font-medium text-fg">{email}</span>.
            </>
          ) : (
            <>We won&apos;t send you further outreach.</>
          )}{" "}
          {already
            ? "This address was already unsubscribed — nothing has changed."
            : "It takes effect immediately."}
        </p>

        <p className="mt-4 text-xs leading-relaxed text-subtle">
          This only covers outreach email. It doesn&apos;t affect any BioHubNet
          training account you may hold, or messages you asked us for.
        </p>

        <hr className="my-6 border-line" />

        <address className="text-xs not-italic leading-relaxed text-subtle">
          <span className="font-medium text-muted">{OUTREACH_SENDER_BLOCK.org}</span>
          <br />
          {OUTREACH_SENDER_BLOCK.address}
          <br />
          <a href={`mailto:${OUTREACH_SENDER_BLOCK.email}`} className="text-brand-700 hover:text-brand-900">
            {OUTREACH_SENDER_BLOCK.email}
          </a>
        </address>
        <p className="mt-3 text-xs text-subtle">
          Reached this by mistake? Email us at {OUTREACH_SENDER_BLOCK.email} and we&apos;ll put it back.
        </p>
      </div>
    </main>
  );
}
