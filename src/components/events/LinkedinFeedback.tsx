import { ExternalLink, Quote } from "lucide-react";
import Image from "next/image";
import type { LinkedinTestimonial } from "@/lib/events/linkedin";
import { CopyFeedback } from "./CopyFeedback";

const topics = { symposium: "Annual Symposium", training_week: "Training Week", both: "Symposium + Training Week" };

export function LinkedinFeedback({ quotes }: { quotes: LinkedinTestimonial[] }) {
  return <main data-theme="light" className="min-h-screen bg-bg px-5 py-8 text-fg [color-scheme:light] sm:px-8 sm:py-12">
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-wrap items-center justify-between gap-5 border-b border-line pb-6">
        <a href="https://biohubnet.ca/" aria-label="BioHubNet home"><Image src="/biohubnet-logo.png" width={220} height={66} unoptimized alt="BioHubNet" className="h-auto w-44 sm:w-52" /></a>
        <a href="https://biohubnet.ca/2026-annual-symposium/" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold underline underline-offset-4">2026 Annual Symposium<ExternalLink size={15} /></a>
      </header>
      <section className="py-10 sm:py-12" aria-labelledby="feedback-title">
        <p className="text-sm font-semibold text-brand-700">2026 Annual Symposium &amp; Training Week</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-5"><h1 id="feedback-title" className="text-3xl font-bold sm:text-4xl">Community reflections</h1><CopyFeedback quotes={quotes} all /></div>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">Conversations, connections and new perspectives, in our community’s own words. Selected excerpts from public LinkedIn posts.</p>
      </section>
      {quotes.length ? <div className="grid gap-x-8 md:grid-cols-2">{quotes.map(q => <article key={q.sourceUrl} className="min-w-0 border-t border-line py-7 sm:py-8">
        <div className="flex items-center justify-between gap-3"><Quote size={26} className="text-brand-700" aria-hidden="true" /><span className="text-xs font-semibold text-muted">{topics[q.topic]}</span></div>
        <blockquote className="mt-4 whitespace-pre-wrap break-words text-lg leading-relaxed [overflow-wrap:anywhere]">{q.quote}</blockquote>
        <p className="mt-5 font-bold">{q.author}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3"><a href={q.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold underline underline-offset-4">Original on LinkedIn<ExternalLink size={14} /></a><CopyFeedback quotes={[q]} /></div>
      </article>)}</div> : <p className="border-t border-line py-10 text-muted">Community reflections will appear here soon.</p>}
      <footer className="mt-6 border-t border-line py-6 text-sm text-muted">BioHubNet · Building Canada’s biomanufacturing talent network</footer>
    </div>
  </main>;
}
