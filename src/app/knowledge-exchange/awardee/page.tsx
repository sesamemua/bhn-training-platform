/**
 * Public Knowledge Exchange awardee intake — /knowledge-exchange/awardee.
 *
 * No login: awardees are sent one link and fill it in once. Same shape
 * and daylight look as the speaker intake, which solves the same problem
 * for invited speakers.
 */
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { KeAwardeeForm } from "@/components/knowledge-exchange/KeAwardeeForm";
import { QUOTE_WORDS_KEY, settingsFrom } from "@/lib/knowledge-exchange/intake";
import styles from "@/app/events/[slug]/speaker/speaker-intake.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Knowledge Exchange awardee details",
  robots: { index: false, follow: false },
};

export default async function KeAwardeePage() {
  const { quoteMaxWords } = settingsFrom(
    await prisma.platformSetting.findMany({ where: { key: QUOTE_WORDS_KEY } }),
  );

  return (
    <main
      data-theme="light"
      className={`${styles.daylight} min-h-screen bg-gradient-to-b from-[var(--speaker-page-tint)] to-white px-4 py-12`}
    >
      <div className="mx-auto max-w-xl">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--brand-700)]">
          BioHubNet · Knowledge Exchange
        </p>
        <h1 className="mt-1.5 text-2xl font-bold text-[var(--speaker-control-ink)]">Awardee details</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--speaker-copy)]">
          Congratulations on your Knowledge Exchange award! Please share a few details and a
          photo — we’ll use them to introduce you and your project.
        </p>
        <div className="mt-7">
          <KeAwardeeForm quoteMaxWords={quoteMaxWords} />
        </div>
      </div>
    </main>
  );
}
