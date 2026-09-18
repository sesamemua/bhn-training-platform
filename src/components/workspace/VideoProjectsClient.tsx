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
import { Plus, Trash2, FileText, Loader2, Clapperboard, ClipboardList, Receipt } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { callSheetsPath, productionCostPath, projectPath } from "@/lib/video/paths";

interface ProjectRow {
  id: string;
  title: string;
  summary: string;
  status: string;
  scriptCount: number;
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
        <div className="grid gap-5 lg:grid-cols-2">
          {projects.map((p) => (
            <article key={p.id} className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-card-solid shadow-card-rest transition-shadow hover:shadow-elevated">
              {/* Clapper stick */}
              <div aria-hidden className="h-4" style={{ background: "repeating-linear-gradient(-45deg, #111 0 16px, #f4f4f4 16px 32px)" }} />

              {/* The slate: always black, whatever the app theme — it is one. */}
              <div className="flex-1 bg-[#15191d] px-5 pb-5 pt-4 text-white">
                <div className="flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white/55">
                  <span>Production</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-2 py-0.5 tracking-[0.12em] text-white/80">
                    <span className={`h-1.5 w-1.5 rounded-full ${p.status === "active" ? "bg-emerald-400" : "bg-white/40"}`} />
                    {p.status}
                  </span>
                </div>
                <Link href={projectPath(p.id)} className="mt-2 block outline-none focus-visible:ring-2 focus-visible:ring-white/60">
                  <h3 className="text-[22px] font-extrabold leading-tight tracking-tight group-hover:underline">{p.title}</h3>
                </Link>
                {p.summary && <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-white/70">{p.summary}</p>}

                <dl className="mt-4 grid grid-cols-2 overflow-hidden rounded-md border border-white/25 sm:grid-cols-4">
                  {[
                    ["Scripts", String(p.scriptCount)],
                    ["Call sheets", String(p.callSheetCount)],
                    ["Shoot", shortDate(p.shootDate)],
                    ["Budget", money(p.budget)],
                  ].map(([k, v], i) => (
                    <div key={k} className={`px-3 py-2 ${i % 2 ? "border-l border-white/25" : ""} ${i > 1 ? "border-t border-white/25 sm:border-t-0" : ""} ${i === 2 ? "sm:border-l" : ""}`}>
                      <dt className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-white/50">{k}</dt>
                      <dd className="mt-0.5 truncate font-mono text-[17px] font-semibold tabular-nums">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* The project's three tabs */}
              <div className="flex flex-wrap items-center gap-1 px-3 py-2.5">
                {[
                  { href: projectPath(p.id), label: "Scripts", icon: FileText },
                  { href: callSheetsPath(p.id), label: "Call sheets", icon: ClipboardList },
                  { href: productionCostPath(p.id), label: "Production cost", icon: Receipt },
                ].map((l) => (
                  <Link key={l.label} href={l.href} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold text-fg hover:bg-elevated">
                    <l.icon size={13} className="text-muted" /> {l.label}
                  </Link>
                ))}
                <button
                  type="button"
                  onClick={() => remove(p.id, p.title)}
                  title="Delete project"
                  aria-label={`Delete ${p.title}`}
                  className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-rose-500/10 hover:text-rose-700"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
