import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { loadFeedbackHistory } from '@/lib/page-review/feedback-history-store';

export const dynamic = 'force-dynamic';
export default async function ReviewerFeedbackPage({ searchParams }: { searchParams: Promise<{ review?: string }> }) {
  await requireRole('admin');
  const { review } = await searchParams;
  const selected = typeof review === 'string' ? review : undefined;
  const [reviews, history] = await Promise.all([
    prisma.pageReview.findMany({ select: { id: true, title: true }, orderBy: { updatedAt: 'desc' } }),
    loadFeedbackHistory(selected),
  ]);
  const format = (time: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(time));
  return <main className="mx-auto max-w-6xl space-y-6 p-6 text-slate-800">
    <div><Link href="/admin/workspace" className="text-sm underline">Workspace</Link><h1 className="mt-3 text-3xl font-semibold">Reviewer feedback &amp; preferences</h1>
      <p className="mt-3 max-w-3xl text-slate-600">Every saved comment version keeps its project, round, quoted element and attribution. Explore how requests develop over time. Topic groups are evidence to review before applying a preference to new work.</p>
      <p className="mt-2 text-sm text-slate-600">History starts with the available comments at activation. Earlier overwritten or deleted wording may be unavailable. Guest identities remain unverified. Original evidence stays visible when later requests differ.</p></div>
    <form className="flex flex-wrap items-end gap-3 rounded-xl border p-4" method="GET"><label className="grid gap-1 text-sm">Project / review<select name="review" defaultValue={selected ?? ''} className="max-w-full rounded border p-2"><option value="">All projects · kept separate</option>{reviews.map(r=><option key={r.id} value={r.id}>{r.title}</option>)}</select></label><button className="rounded bg-slate-800 px-4 py-2 text-white">Show history</button>
      <a className="p-2 text-sm underline" href={'/api/workspace/page-review/feedback-memory'+(selected?'?review='+encodeURIComponent(selected):'')}>Download source history</a></form>
    <p className="text-sm text-slate-600">{history.events.length} preserved evidence records · {history.reviewers.length} reviewer identities · admin access</p>
    {!history.reviewers.length && <p>No feedback has been captured yet. Existing comments will appear after the initial baseline is saved.</p>}
    {history.reviewers.map(person=><section key={person.id} className="rounded-xl border bg-white p-5"><h2 className="text-xl font-semibold">{person.name}</h2><p className="text-sm text-slate-600">{person.verified?'Platform identity':'Unverified identity · reviewed separately'}</p>
      {person.projects.map(project=><div key={project.reviewId} className="mt-5 border-t pt-4"><h3 className="text-lg font-medium">{project.title}</h3><p className="text-sm text-slate-600">{project.evidenceCount} available comments · preferences scoped to this project</p>
        <div className="my-4 grid gap-3 md:grid-cols-2">{project.themes.map(theme=><details key={theme.name} className="rounded-lg bg-slate-50 p-3"><summary className="cursor-pointer font-medium">{theme.name} · {theme.count} · {theme.strength}</summary><p className="my-2 text-xs text-slate-600">Source wording is explicit feedback. A recurring topic is a working observation; it does not establish a universal rule.</p>{theme.examples.map(e=><blockquote key={e.comment.id} className="my-3 border-l-2 border-teal-600 pl-3 text-sm"><p className="whitespace-pre-wrap">{e.comment.body}</p><footer className="mt-1 text-xs text-slate-600">Round {e.comment.round} · {format(e.occurredAt)} · {e.comment.anchorBlock ?? e.comment.anchorQuote ?? 'General feedback'}</footer></blockquote>)}</details>)}</div>
        <details><summary className="cursor-pointer font-medium">Dated feedback and changes · {project.timeline.length} records</summary><ol className="mt-3 space-y-4">{project.timeline.map((e,index)=><li key={e.comment.id+':'+index} className="rounded-lg border p-4"><p className="text-sm font-medium">{format(e.occurredAt)} · Round {e.comment.round} · {e.event} · {e.comment.status}</p><p className="text-xs text-slate-600">Original author: {e.comment.authorName}{e.comment.editedByName?' · Edited by '+e.comment.editedByName:''} · Recorded by {e.actor.name}</p><blockquote className="my-2 whitespace-pre-wrap">{e.comment.body}</blockquote>{e.comment.anchorQuote&&<p className="rounded bg-slate-50 p-2 text-sm">Quoted element: {e.comment.anchorQuote}</p>}{e.comment.anchorBlock&&<p className="mt-2 text-sm">Page / section: {e.comment.anchorBlock}</p>}<p className="mt-2 break-all text-xs text-slate-500">Comment {e.comment.id} · {e.comment.anchorPath ?? e.comment.anchorKey ?? 'Page-level feedback'}{e.review.revision?' · Document '+e.review.revision.slice(0,12):''}</p></li>)}</ol></details>
      </div>)}
    </section>)}
  </main>;
}
