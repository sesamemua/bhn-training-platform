/**
 * A video project's By person tab: pick a person and see everything that
 * is theirs across the other tabs — when to arrive and what they are on
 * during the shoot, their call-sheet line, what to do before the shoot
 * and on the prep day, what to bring, and their scripts. Read-only; each
 * part links back to the tab where it is edited.
 */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Users } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { ProjectNav } from "@/components/workspace/ProjectNav";
import { ProjectBackLink } from "@/components/workspace/ProjectBackLink";
import { DEFAULT_PRESHOOT, mergePrep, prepKey, preshootKey, type PrepTask } from "@/lib/video/prep";
import { kitKey, mergeKit } from "@/lib/video/kit";
import { parseCallSheetData } from "@/lib/video/call-sheet";
import { clock, longDate, minuteOfDay, minutesToHhmm } from "@/lib/video/filming";
import { personView, roster, scriptPanels, type PersonView, type ScriptPanel } from "@/lib/video/by-person";
import { beforePath, callSheetsPath, filmingPath, logisticsPath, prepPath, scriptPath } from "@/lib/video/paths";

export const dynamic = "force-dynamic";
interface Props { params: Promise<{ projectId: string }>; searchParams: Promise<{ person?: string }> }

const H2 = "flex items-baseline justify-between gap-2 text-[13px] font-bold uppercase tracking-wide text-subtle";
const hhmm = (iso: string) => minutesToHhmm(minuteOfDay(iso));
const EDIT = "text-[11.5px] font-semibold normal-case tracking-normal text-brand-600 hover:underline";

function Tasks({ tasks, today }: { tasks: PrepTask[]; today: string }) {
  if (!tasks.length) return <p className="text-[12.5px] italic text-subtle">Nothing on their list.</p>;
  return (
    <ul className="space-y-1">
      {tasks.map((t) => (
        <li key={t.id} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
          <span aria-hidden className={t.done ? "text-emerald-500" : "text-subtle"}>{t.done ? "✓" : "○"}</span>
          <span className={t.done ? "text-subtle line-through" : "font-semibold text-fg"}>{t.title}</span>
          {t.due && <span className={`text-[11.5px] ${!t.done && t.due < today ? "font-semibold text-rose-600" : "text-muted"}`}>due {longDate(t.due).replace(/, \d{4}$/, "")}{!t.done && t.due < today ? " · overdue" : ""}</span>}
          {t.notes && <span className="basis-full pl-5 text-[12px] text-muted">{t.notes}</span>}
          {t.items.length > 0 && <span className="basis-full pl-5 text-[12px] text-muted">{t.items.filter((i) => i.checked).length} of {t.items.length} ready: {t.items.map((i) => i.label).join(" · ")}</span>}
        </li>
      ))}
    </ul>
  );
}

export default async function ByPersonPage({ params, searchParams }: Props) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");
  const { projectId } = await params;
  const { person } = await searchParams;
  const project = await prisma.videoProject.findUnique({
    where: { id: projectId },
    select: {
      id: true, title: true,
      filming: {
        select: {
          date: true, location: true,
          people: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, group: true, role: true } },
          blocks: { orderBy: { start: "asc" }, select: { id: true, kind: true, title: true, start: true, end: true, prepMinutes: true, flexible: true, done: true, people: true, facilitators: true } },
        },
      },
    },
  });
  if (!project) notFound();
  const filming = project.filming;
  const people = filming?.people ?? [];
  const date = filming?.date.toISOString().slice(0, 10) ?? null;

  const [settings, sheets, scripts] = await Promise.all([
    prisma.platformSetting.findMany({ where: { key: { in: [prepKey(projectId), preshootKey(projectId), kitKey(projectId)] } }, select: { key: true, value: true } }),
    prisma.callSheet.findMany({ where: { projectId }, orderBy: { updatedAt: "desc" }, select: { id: true, shootDate: true, data: true } }),
    prisma.script.findMany({ where: { projectId, isArchived: false }, select: { id: true, richContent: true } }),
  ]);
  const setting = (k: string) => settings.find((s) => s.key === k)?.value;
  const prep = mergePrep(setting(prepKey(projectId)), people);
  const before = mergePrep(setting(preshootKey(projectId)), people, DEFAULT_PRESHOOT);
  const kit = mergeKit(setting(kitKey(projectId)));
  // The shoot day's call sheet, else the latest one.
  const sheetRow = sheets.find((s) => date && s.shootDate?.toISOString().slice(0, 10) === date) ?? sheets[0];
  const sheet = sheetRow ? parseCallSheetData(sheetRow.data) : null;
  const panels: (ScriptPanel & { scriptId: string })[] = scripts.flatMap((s) => {
    const html = (s.richContent as { html?: unknown } | null)?.html;
    return typeof html === "string" ? scriptPanels(html).map((p) => ({ ...p, scriptId: s.id })) : [];
  });

  const blocks = (filming?.blocks ?? []).map((b) => ({ ...b, start: b.start.toISOString(), end: b.end.toISOString() }));
  const everyone = roster(people, kit.owners, sheet);
  const views = everyone.map((p) => personView(p, { blocks, before, prep, kit: kit.items, sheet, panels }));
  const load = (v: PersonView) => v.day.length + v.before.filter((t) => !t.done).length + v.prep.filter((t) => !t.done).length + v.bring.length;
  const pick = views.find((v) => v.slug === person) ?? null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());
  const scriptOf = (key: string) => panels.find((p) => p.key === key);

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow={<><Users size={11} /> Video Production · By person</>}
        title={project.title}
        description="Pick a person to see everything that is theirs: when to arrive and what they are on during the shoot, what to do before it, what to bring, and their scripts — pulled from all the other tabs."
        actions={<ProjectBackLink />}
      />
      <ProjectNav projectId={project.id} />

      <nav aria-label="People" className="flex flex-wrap gap-1.5">
        {views.map((v) => (
          <Link
            key={v.slug}
            href={`?person=${v.slug}`}
            aria-current={pick?.slug === v.slug ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] font-semibold ${
              pick?.slug === v.slug ? "border-brand-400 bg-brand-500/15 text-fg" : "border-line text-muted hover:text-fg"
            }`}
          >
            {v.name}
            {load(v) > 0 && <span className="rounded-full bg-elevated px-1.5 text-[10.5px] tabular-nums text-subtle">{load(v)}</span>}
          </Link>
        ))}
      </nav>

      {!pick ? (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-[13px] text-muted">
          Pick a name above. The number is how many things are theirs — shoot-day slots, open tasks and things to bring.
          Each person&apos;s page has its own link to send them.
        </p>
      ) : (
        <article className="space-y-4 rounded-xl border border-line bg-card p-4">
          <header className="flex flex-wrap items-baseline gap-x-3">
            <h2 className="text-[20px] font-bold text-fg">{pick.name}</h2>
            {pick.role && <span className="text-[13px] text-muted">{pick.role}</span>}
          </header>

          <section className="space-y-1.5">
            <h3 className={H2}>
              <span>On the day{date ? ` · ${longDate(date)}` : ""}</span>
              <Link href={filmingPath(projectId)} className={EDIT}>Filming day</Link>
            </h3>
            {pick.arrive ? (
              <p className="text-[14px] text-fg">
                <strong>Arrive by {clock(pick.arrive)}</strong>
                {filming?.location && <> at {filming.location}</>}
                {pick.callSheet?.notes && <span className="text-muted"> · {pick.callSheet.notes}</span>}
                {pick.callSheet?.call && pick.callSheet.call !== hhmm(pick.arrive) && (
                  <span className="block text-[12px] font-semibold text-amber-600">
                    The call sheet says {pick.callSheet.call} — rebuild it from the Filming day if that is out of date.
                  </span>
                )}
              </p>
            ) : pick.callSheet?.call ? (
              <p className="text-[14px] text-fg"><strong>Call {pick.callSheet.call}</strong> <span className="text-[12px] text-muted">(from the call sheet; not on the Filming day)</span></p>
            ) : <p className="text-[12.5px] italic text-subtle">Not on the filming day.</p>}
            {pick.day.length > 0 && (
              <ol className="space-y-1">
                {pick.day.map((d) => (
                  <li key={d.id} className={`flex flex-wrap items-baseline gap-x-2 text-[13px] ${d.done ? "text-subtle line-through" : "text-fg"}`}>
                    <span className="w-36 shrink-0 font-semibold tabular-nums">{clock(d.start)}–{clock(d.end)}</span>
                    <span className="font-semibold">{d.title}</span>
                    <span className={`rounded px-1.5 text-[10.5px] font-semibold uppercase tracking-wide ${d.how === "on camera" ? "bg-rose-500/12 text-rose-600" : d.how === "facilitating" ? "bg-sky-500/12 text-sky-700" : "bg-elevated text-muted"}`}>{d.how}</span>
                    {d.filming && d.filming !== d.start && <span className="text-[12px] text-muted">camera at {clock(d.filming)}{d.how === "on camera" ? " — before that, prep and make-up" : ""}</span>}
                    {d.flexible && <span className="text-[12px] italic text-amber-600">time not fixed yet</span>}
                  </li>
                ))}
              </ol>
            )}
            {sheet && (sheet.parking || sheet.meals) && (
              <p className="text-[12px] text-muted">
                {sheet.parking && <>Parking: {sheet.parking} </>}
                {sheet.meals && <>· Meals: {sheet.meals}</>}{" "}
                <Link href={callSheetsPath(projectId)} className={EDIT}>Call sheet</Link>
              </p>
            )}
          </section>

          <section className="space-y-1.5">
            <h3 className={H2}><span>Before the shoot</span><Link href={beforePath(projectId)} className={EDIT}>Before the shoot</Link></h3>
            <Tasks tasks={pick.before} today={today} />
          </section>

          <section className="space-y-1.5">
            <h3 className={H2}><span>Prep day</span><Link href={prepPath(projectId)} className={EDIT}>Prep day</Link></h3>
            <Tasks tasks={pick.prep} today={today} />
          </section>

          <section className="space-y-1.5">
            <h3 className={H2}><span>Bring</span><Link href={logisticsPath(projectId)} className={EDIT}>Logistics</Link></h3>
            {pick.bring.length ? (
              <ul className="grid gap-x-4 gap-y-0.5 text-[13px] sm:grid-cols-2">
                {pick.bring.map((i) => (
                  <li key={i.id} className={i.checked ? "text-subtle line-through" : "text-fg"}>
                    <span aria-hidden className={i.checked ? "text-emerald-500" : "text-subtle"}>{i.checked ? "✓ " : "○ "}</span>{i.label}
                    <span className="text-[11px] text-subtle"> · {i.group}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-[12.5px] italic text-subtle">Nothing to bring.</p>}
          </section>

          <section className="space-y-1.5">
            <h3 className={H2}><span>Scripts</span></h3>
            {pick.scripts.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {pick.scripts.map((s) => {
                  const p = scriptOf(s.key);
                  return p && (
                    <li key={s.key}>
                      <Link href={`${scriptPath(projectId, p.scriptId)}?tab=${encodeURIComponent(s.key)}`} className="inline-flex rounded-lg border border-line px-2.5 py-1 text-[12.5px] font-semibold text-fg hover:border-brand-400">
                        {s.label} →
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="text-[12.5px] italic text-subtle">No script with their name on it.</p>}
          </section>
        </article>
      )}
    </div>
  );
}

