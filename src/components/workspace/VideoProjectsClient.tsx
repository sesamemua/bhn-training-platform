"use client";

/**
 * Video Production project list — create / open / delete projects. Each
 * project is drawn as a film slate: clapper stripes, a black slate with the
 * title in chalk, and the slate's boxes holding scripts, call sheets, the
 * shoot day and the budget. Its three tabs are one click from the card.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, FileText, Loader2, Clapperboard, ClipboardList, Receipt, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { callSheetsPath, productionCostPath } from "@/lib/video/paths";

interface ProjectRow {
  id: string;
  title: string;
  summary: string;
  status: string;
  scriptCount: number;
  /** Straight into the script when there is one, else the list. */
  scriptsHref: string;
  firstScript: string;
  callSheetCount: number;
  /** YYYY-MM-DD, or "" when no call sheet has a date. */
  shootDate: string;
  /** Production cost total in cents, or null when the project has no budget. */
  budget: number | null;
  updatedAt: string;
}

const shortDate = (d: string) =>
  d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { day: "numeric", month: "short", timeZone: "UTC" }) : "—";
const money = (cents: number | null) =>
  cents == null ? "—" : `$${Math.round(cents / 100).toLocaleString("en-CA")}`;

export function VideoProjectsClient({ initialProjects }: { initialProjects: ProjectRow[] }) {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRow[]>(initialProjects);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    const t = title.trim();
    if (!t) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/workspace/video-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; project?: { id: string }; error?: string };
      if (!res.ok || !j.ok) { setError(j.error ?? "Couldn't create."); return; }
      setTitle("");
      router.refresh();
      if (j.project) router.push(`/admin/workspace/marketing/video/${j.project.id}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete "${name}" and all its scripts? This can't be undone.`)) return;
    setProjects((cur) => cur.filter((p) => p.id !== id));
    await fetch(`/api/workspace/video-projects/${id}?force=true`, { method: "DELETE" }).catch(() => {});
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {/* Create + seed row */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-[16rem]">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-subtle">New project</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder="e.g. BHN Recruitment Reel"
              className="mt-1 w-full rounded-md border border-line bg-card-solid px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </label>
          <button
            type="button"
            onClick={create}
            disabled={busy || !title.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
      </Card>

      {/* Project grid */}
      {projects.length === 0 ? (
        <Card className="px-5 py-10 text-center">
          <Clapperboard size={22} className="mx-auto text-muted" />
          <p className="mt-2 text-sm font-medium text-fg">No video projects yet</p>
          <p className="mt-1 text-xs text-muted">Create one above to get started.</p>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {projects.map((p) => {
            const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
            const tiles = [
              {
                href: p.scriptsHref, label: "Scripts", icon: FileText, tone: "bg-sky-500/12 text-sky-700",
                value: p.scriptCount === 1 && p.firstScript ? p.firstScript : plural(p.scriptCount, "script", "scripts"),
              },
              {
                href: productionCostPath(p.id), label: "Production cost", icon: Receipt, tone: "bg-emerald-500/12 text-emerald-700",
                value: p.budget == null ? "No budget yet" : `${money(p.budget)} total`,
              },
              {
                href: callSheetsPath(p.id), label: "Call sheets", icon: ClipboardList, tone: "bg-amber-500/15 text-amber-700",
                value: p.callSheetCount ? `${plural(p.callSheetCount, "sheet", "sheets")} · ${shortDate(p.shootDate)}` : "None yet",
              },
            ];
            return (
              <article key={p.id} className="group flex min-h-[30rem] flex-col overflow-hidden rounded-2xl border border-line bg-card-solid shadow-card-rest transition-shadow hover:shadow-elevated">
                {/* Clapper stick */}
                <div aria-hidden className="h-5 shrink-0" style={{ background: "repeating-linear-gradient(-45deg, #111 0 18px, #f4f4f4 18px 36px)" }} />

                {/* The slate: always black, whatever the app theme — it is one. */}
                <div className="flex flex-1 flex-col bg-[#15191d] px-6 pb-6 pt-5 text-white">
                  <div className="flex items-center justify-between gap-3 text-[10.5px] font-bold uppercase tracking-[0.2em] text-white/55">
                    <span>Production</span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-2.5 py-0.5 tracking-[0.12em] text-white/80">
                      <span className={`h-1.5 w-1.5 rounded-full ${p.status === "active" ? "bg-emerald-400" : "bg-white/40"}`} />
                      {p.status}
                    </span>
                  </div>
                  <Link href={p.scriptsHref} className="mt-3 block outline-none focus-visible:ring-2 focus-visible:ring-white/60">
                    <h3 className="text-[28px] font-extrabold leading-[1.1] tracking-tight group-hover:underline">{p.title}</h3>
                  </Link>
                  {p.summary && <p className="mt-2 line-clamp-3 text-[14px] leading-relaxed text-white/70">{p.summary}</p>}

                  <dl className="mt-auto grid grid-cols-3 overflow-hidden rounded-md border border-white/25 pt-0">
                    {[
                      ["Shoot", shortDate(p.shootDate)],
                      ["Scripts", String(p.scriptCount)],
                      ["Call sheets", String(p.callSheetCount)],
                    ].map(([k, v], i) => (
                      <div key={k} className={`px-4 py-3 ${i ? "border-l border-white/25" : ""}`}>
                        <dt className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">{k}</dt>
                        <dd className="mt-1 truncate font-mono text-[20px] font-semibold tabular-nums">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                {/* The project's three tabs, as big labelled tiles */}
                <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-3">
                  {tiles.map((t) => (
                    <Link
                      key={t.label}
                      href={t.href}
                      className="flex flex-col gap-2 rounded-xl border border-line bg-card-solid p-3.5 outline-none transition-colors hover:border-brand-400 hover:bg-elevated focus-visible:ring-2 focus-visible:ring-brand-500/50"
                    >
                      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${t.tone}`}><t.icon size={16} /></span>
                      <span className="text-[14.5px] font-bold text-fg">{t.label}</span>
                      <span className="truncate text-[12px] text-muted" title={t.value}>{t.value}</span>
                      <span className="mt-auto inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-700">Open <ArrowRight size={12} /></span>
                    </Link>
                  ))}
                </div>
                <div className="flex justify-end border-t border-line px-3 py-1.5">
                  <button
                    type="button"
                    onClick={() => remove(p.id, p.title)}
                    title="Delete project"
                    aria-label={`Delete ${p.title}`}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] text-muted hover:bg-rose-500/10 hover:text-rose-700"
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
