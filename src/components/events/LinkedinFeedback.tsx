"use client";

import { ExternalLink, Moon, Quote, Sun, UserRound } from "lucide-react";
import { useState } from "react";
import Image from "next/image";
import type { LinkedinTestimonial } from "@/lib/events/linkedin";
import { CopyFeedback } from "./CopyFeedback";
import { useTheme } from "@/components/ui/ThemeProvider";

const topics = { symposium: "Annual Symposium", training_week: "Training Week", both: "Symposium + Training Week" };

export function LinkedinFeedback({ quotes }: { quotes: LinkedinTestimonial[] }) {
  const { theme, setTheme } = useTheme();
  const dark = theme === "hitech";
  return <main data-theme={theme} style={{ colorScheme: dark ? "dark" : "light", letterSpacing: 0 }} className="min-h-screen bg-bg px-5 py-8 text-fg sm:px-8 sm:py-12">
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-wrap items-center justify-between gap-5 border-b border-line pb-6">
        <a href="https://biohubnet.ca/" aria-label="BioHubNet home"><Image src="/biohubnet-logo.png" width={220} height={66} unoptimized alt="BioHubNet" className={`h-auto w-44 sm:w-52 ${dark ? "brightness-0 invert" : ""}`} /></a>
        <div className="flex flex-wrap items-center gap-3"><a href="https://biohubnet.ca/2026-annual-symposium/" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold underline underline-offset-4">2026 Annual Symposium<ExternalLink size={15} /></a>
          <button type="button" aria-label={dark ? "Switch to light appearance" : "Switch to dark appearance"} title={dark ? "Light appearance" : "Dark appearance"} onClick={() => setTheme(dark ? "light" : "hitech")} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-line hover:bg-elevated">{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
        </div>
      </header>
      <section className="py-10 sm:py-12" aria-labelledby="feedback-title">
        <p className="text-sm font-semibold text-brand-700">2026 Annual Symposium &amp; Training Week</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-5"><h1 id="feedback-title" style={{ letterSpacing: 0 }} className="text-3xl font-bold sm:text-4xl">Community reflections</h1><CopyFeedback quotes={quotes} all visual /></div>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">Conversations, connections and new perspectives, in our community’s own words. {quotes.length} selected reflections from public LinkedIn posts and comments.</p>
      </section>
      {quotes.length ? <div className="grid items-start gap-5 md:grid-cols-2">{quotes.map(q => <article key={q.sourceUrl} data-feedback-source={q.sourceUrl} className="min-w-0 rounded-lg border border-line bg-card-solid p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <AuthorPhoto key={q.profile?.photoUrl} author={q.author} url={q.profile?.photoUrl} />
          <div className="min-w-0 break-words"><p className="font-bold">{q.profile?.profileUrl ? <a href={q.profile.profileUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-current/30 underline-offset-4 hover:decoration-current">{q.author}</a> : q.author}</p>
            {q.profile?.title && <p className="mt-1 text-sm leading-snug">{q.profile.title}</p>}
            <p className="mt-1 text-sm leading-snug text-muted">{q.profile?.affiliation || "Affiliation not listed"}</p>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between gap-3"><Quote size={23} className="text-brand-500" aria-hidden="true" /><span className="text-xs font-semibold text-muted">{topics[q.topic]}</span></div>
        <blockquote className="mt-4 whitespace-pre-wrap break-words text-lg leading-relaxed [overflow-wrap:anywhere]">{q.quote}</blockquote>
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4"><a href={q.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold underline underline-offset-4">Read original {q.kind === "comment" ? "comment" : "post"}<ExternalLink size={14} /></a><CopyFeedback quotes={[q]} visual /></div>
      </article>)}</div> : <p className="border-t border-line py-10 text-muted">Community reflections will appear here soon.</p>}
      <footer className="mt-6 border-t border-line py-6 text-sm text-muted">BioHubNet · Building Canada’s biomanufacturing talent network</footer>
    </div>
  </main>;
}

function AuthorPhoto({ author, url }: { author: string; url?: string }) {
  const [failed, setFailed] = useState(false);
  return <span className="flex h-18 w-18 shrink-0 items-center justify-center overflow-hidden rounded-full bg-elevated">
    {url && !failed ? <Image src={url} width={72} height={72} unoptimized alt={`${author} profile image`} onError={() => setFailed(true)} className="h-full w-full object-contain" /> : <UserRound size={28} className="text-muted" aria-label="Profile image unavailable" />}
  </span>;
}
