"use client";

/**
 * Design review, above the artwork itself: the list of projects, one
 * project's artworks (each with who has seen and OK'd it and the
 * approver's decision), and the bar over an open artwork. Everything
 * here can be added, renamed, replaced, reordered and deleted.
 */
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, CheckCircle2, CircleDashed, Eye, FolderPlus, Loader2, MessageSquare, Pencil, RefreshCw, Trash2, Upload } from "lucide-react";
import { APPROVAL_LABEL, givenNames, initials, type Approval, type Seen } from "@/lib/design-review/types";
import {
  createDesignArtwork, createDesignProject, deleteDesignArtwork, deleteDesignProject, moveDesignArtwork,
  replaceDesignArtworkPages, updateDesignArtwork, updateDesignProject,
} from "@/lib/design-review/actions";
import { uploadFile } from "@/lib/design-review/render";
import { ConfirmPopover } from "@/components/ui/ConfirmPopover";

const BASE = "/admin/workspace/design-review";
const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";
const field = "w-full rounded-md border border-line bg-card px-2.5 py-1.5 text-[13px] text-fg focus:border-brand-400 focus:outline-none";
const ghost = "inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[12px] font-semibold text-fg hover:bg-elevated disabled:opacity-40";
const primary = "inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50";
const TONE: Record<Approval, string> = { pending: "bg-amber-500/15 text-amber-700", approved: "bg-emerald-500/15 text-emerald-700", changes: "bg-rose-500/15 text-rose-700" };

export interface Person { id: string; name: string }
type Result = { ok: boolean; error?: string; id?: string };

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<Result>, after?: (r: Result) => void) => start(async () => {
    setError(null);
    const r = await fn().catch((): Result => ({ ok: false, error: "That didn't save — try again." }));
    if (!r.ok) { setError(r.error ?? "That didn't save — try again."); return; }
    after?.(r);
    router.refresh();
  });
  return { pending, error, setError, run, router };
}

function ProjectFields({ idp, value, onChange, staff }: {
  idp: string;
  value: { name: string; description: string; approverId: string | null };
  onChange: (v: { name: string; description: string; approverId: string | null }) => void;
  staff: Person[];
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_14rem]">
      <label className="text-[12px] font-semibold text-muted" htmlFor={`${idp}-name`}>Project name
        <input id={`${idp}-name`} value={value.name} maxLength={120} onChange={(e) => onChange({ ...value, name: e.target.value })} className={`mt-1 ${field}`} />
      </label>
      <label className="text-[12px] font-semibold text-muted" htmlFor={`${idp}-approver`}>Who approves
        <select id={`${idp}-approver`} value={value.approverId ?? ""} onChange={(e) => onChange({ ...value, approverId: e.target.value || null })} className={`mt-1 ${field}`}>
          <option value="">No approver</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <label className="text-[12px] font-semibold text-muted sm:col-span-2" htmlFor={`${idp}-desc`}>What it is for (optional)
        <input id={`${idp}-desc`} value={value.description} maxLength={600} onChange={(e) => onChange({ ...value, description: e.target.value })} className={`mt-1 ${field}`} />
      </label>
    </div>
  );
}

// ── all projects ─────────────────────────────────────────────────────
export interface ProjectCard { id: string; name: string; description: string; approverName: string | null; artworks: number; approved: number; openComments: number; cover: string | null }

export function DesignProjectList({ projects, staff, defaultApproverId }: { projects: ProjectCard[]; staff: Person[]; defaultApproverId: string | null }) {
  const { pending, error, run, router } = useRun();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", description: "", approverId: defaultApproverId });

  return (
    <div className="space-y-4">
      {adding ? (
        <section className="rounded-xl border border-line bg-card p-4">
          <ProjectFields idp="new-project" value={draft} onChange={setDraft} staff={staff} />
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={pending || !draft.name.trim()} onClick={() => run(() => createDesignProject(draft), (r) => router.push(`${BASE}?p=${r.id}`))} className={primary}>
              {pending && <Loader2 size={13} className="animate-spin" />} Create project
            </button>
            <button type="button" onClick={() => setAdding(false)} className={ghost}>Cancel</button>
          </div>
        </section>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={primary}><FolderPlus size={14} /> New project</button>
      )}
      {error && <p role="alert" className="text-[12.5px] font-semibold text-rose-600">{error}</p>}

      {projects.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-[13px] text-muted">No projects yet. Create one, then upload the artwork to review.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`${BASE}?p=${p.id}`} className="block overflow-hidden rounded-xl border border-line bg-card hover:border-brand-400">
                <div className="grid h-36 place-items-center bg-elevated/60 p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.cover ? <img src={p.cover} alt="" className="max-h-full max-w-full object-contain shadow" /> : <span className="text-[12px] text-subtle">Nothing uploaded yet</span>}
                </div>
                <div className="p-3">
                  <p className="text-[14px] font-bold text-fg">{p.name}</p>
                  {p.description && <p className="mt-0.5 line-clamp-2 text-[12px] text-muted">{p.description}</p>}
                  <p className="mt-1.5 text-[12px] text-muted">
                    {p.artworks} artwork{p.artworks === 1 ? "" : "s"} · {p.approved} approved · {p.openComments} open comment{p.openComments === 1 ? "" : "s"}
                  </p>
                  <p className="text-[11.5px] text-subtle">{p.approverName ? `Approver: ${p.approverName}` : "No approver"}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── one project ──────────────────────────────────────────────────────
export interface ArtworkCard {
  id: string; title: string; description: string; thumb: string | null; pages: number; /** Much wider than tall: its preview takes the full width. */ wide?: boolean;
  approval: Approval; openComments: number; round: number; locked: boolean; reviewers: { id: string; name: string; state: Seen; asked: boolean }[];
}

const SeenIcon = ({ state }: { state: Seen }) =>
  state === "ok" ? <CheckCircle2 size={12} className="text-emerald-600" /> : state === "viewed" ? <Eye size={12} className="text-sky-600" /> : <CircleDashed size={12} className="text-subtle" />;
const SEEN_WORD: Record<Seen, string> = { ok: "OK'd", viewed: "seen", none: "not yet" };

export function DesignProjectView({ project, artworks, staff }: {
  project: { id: string; name: string; description: string; approverId: string | null; approverName: string | null };
  artworks: ArtworkCard[];
  staff: Person[];
}) {
  const { pending, error, setError, run, router } = useRun();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: project.name, description: project.description, approverId: project.approverId });
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /** A title with no file yet: a reminder of something still to be designed. */
  const addPlaceholder = () => run(() => createDesignArtwork(project.id, { title: title.trim(), description: "" }, [], ""), () => setTitle(""));
  const upload = async () => {
    if (!file) return;
    setError(null);
    try {
      const pages = await uploadFile(file, setProgress);
      setProgress("Saving…");
      run(() => createDesignArtwork(project.id, { title: title.trim() || file.name.replace(/\.[^.]+$/, ""), description: "" }, pages, file.name), () => {
        setTitle(""); setFile(null); if (fileRef.current) fileRef.current.value = "";
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That file couldn't be read.");
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-line bg-card p-4">
        {editing ? (
          <>
            <ProjectFields idp="edit-project" value={draft} onChange={setDraft} staff={staff} />
            <div className="mt-3 flex gap-2">
              <button type="button" disabled={pending || !draft.name.trim()} onClick={() => run(() => updateDesignProject(project.id, draft), () => setEditing(false))} className={primary}>Save</button>
              <button type="button" onClick={() => setEditing(false)} className={ghost}>Cancel</button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-[17px] font-bold text-fg"><span>{project.name}</span></h2>
              {project.description && <p className="mt-0.5 text-[13px] text-muted">{project.description}</p>}
              <p className="mt-1 text-[12px] text-subtle">{project.approverName ? `Final approval: ${project.approverName}` : "No approver set"}</p>
            </div>
            <button type="button" onClick={() => setEditing(true)} className={ghost}><Pencil size={12} /> Edit</button>
            <ConfirmPopover message={`Delete “${project.name}”?`} detail="Its artworks and every comment on them go too." confirmLabel="Delete project" tone="danger" onConfirm={() => run(() => deleteDesignProject(project.id), () => router.push(BASE))}>
              {(o) => <button type="button" onClick={o} className={ghost}><Trash2 size={12} /> Delete</button>}
            </ConfirmPopover>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-dashed border-line bg-card p-4">
        <h3 className="text-[12px] font-bold uppercase tracking-wide text-subtle">Add artwork</h3>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="min-w-[14rem] flex-1 text-[12px] font-semibold text-muted" htmlFor="artwork-title">Title
            <input id="artwork-title" value={title} maxLength={160} placeholder="Uses the file name if left empty" onChange={(e) => setTitle(e.target.value)} className={`mt-1 ${field}`} />
          </label>
          <label className="text-[12px] font-semibold text-muted" htmlFor="artwork-file">PDF or image
            <input id="artwork-file" ref={fileRef} type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block text-[12.5px] text-fg file:mr-2 file:rounded-md file:border file:border-line file:bg-elevated file:px-2 file:py-1 file:text-[12px] file:font-semibold" />
          </label>
          <button type="button" disabled={!file || pending || !!progress} onClick={upload} className={primary}>
            {progress ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {progress ?? "Upload"}
          </button>
          <button type="button" disabled={!!file || !title.trim() || pending || !!progress} onClick={addPlaceholder} className={ghost} title="Add it to the list now and upload the artwork later">
            Add as placeholder
          </button>
        </div>
        <p className="mt-1.5 text-[11.5px] text-subtle">Every page of a PDF becomes a picture people can comment on. Nothing to upload yet? Type a title and add it as a placeholder.</p>
      </section>
      {error && <p role="alert" className="text-[12.5px] font-semibold text-rose-600">{error}</p>}

      {artworks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-[13px] text-muted">Nothing to review yet — upload the first artwork above.</p>
      ) : (
        <ol className="grid gap-3 md:grid-cols-2">
          {artworks.map((a, i) => (
            <li key={a.id} className={`flex flex-col gap-3 rounded-xl border bg-card p-3 ${a.pages === 0 ? "border-dashed border-line" : "border-line"}`}>
              {/* Every preview gets the same frame — the same height, the card's width — so a wide strip
                  and a tall banner read at a similar size instead of one dwarfing the other. */}
              <Link href={`${BASE}?a=${a.id}`} className="grid h-56 place-items-center rounded-lg bg-elevated/60 p-2 hover:ring-2 hover:ring-brand-400">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {a.thumb ? <img src={a.thumb} alt={a.title} loading="lazy" className="max-h-full max-w-full object-contain shadow" />
                  : <span className="text-center text-[12.5px] text-subtle"><span className="block text-[13px] font-semibold text-muted">To do</span>Nothing uploaded yet</span>}
              </Link>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold tabular-nums text-subtle">{i + 1}</span>
                  <Link href={`${BASE}?a=${a.id}`} className="text-[15px] font-bold text-fg hover:underline">{a.title}</Link>
                  {a.pages === 0 ? (
                    <span className="rounded-full bg-elevated px-2 py-0.5 text-[11.5px] font-semibold text-muted">Placeholder — to be designed</span>
                  ) : (
                    <>
                      <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${TONE[a.approval]}`}>{project.approverName ? `${givenNames(project.approverName)}: ${APPROVAL_LABEL[a.approval]}` : APPROVAL_LABEL[a.approval]}</span>
                      <span className="inline-flex items-center gap-1 text-[12px] text-muted"><MessageSquare size={12} /> {a.openComments} open</span>
                      <span className="text-[12px] text-muted">Round {a.round}{a.locked ? " · locked" : ""}</span>
                    </>
                  )}
                  {a.pages > 1 && <span className="text-[12px] text-muted">{a.pages} pages</span>}
                </div>
                {a.description && <p className="mt-0.5 text-[12.5px] text-muted">{a.description}</p>}
                <ul className={`mt-2 flex flex-wrap gap-1.5 ${a.pages === 0 ? "hidden" : ""}`}>
                  {a.reviewers.map((r) => (
                    <li key={r.id} title={`${r.name} — ${SEEN_WORD[r.state]}`} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] ${r.state === "none" ? "border-line text-subtle" : "border-line text-fg"}`}>
                      <SeenIcon state={r.state} /> <span className="font-semibold">{initials(r.name)}</span> <span className="text-subtle">{r.state === "none" && r.asked ? "asked" : SEEN_WORD[r.state]}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <Link href={`${BASE}?a=${a.id}`} className={primary}>{a.pages === 0 ? "Open and upload" : "Open and comment"}</Link>
                  <button type="button" aria-label="Move up" disabled={pending || i === 0} onClick={() => run(() => moveDesignArtwork(a.id, -1))} className={ghost}><ArrowUp size={12} /></button>
                  <button type="button" aria-label="Move down" disabled={pending || i === artworks.length - 1} onClick={() => run(() => moveDesignArtwork(a.id, 1))} className={ghost}><ArrowDown size={12} /></button>
                  <ConfirmPopover message={`Delete “${a.title}”?`} detail="Its comments and review marks go too." confirmLabel="Delete" tone="danger" align="start" onConfirm={() => run(() => deleteDesignArtwork(a.id))}>
                    {(o) => <button type="button" onClick={o} className={ghost}><Trash2 size={12} /> Delete</button>}
                  </ConfirmPopover>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ── the bar over one open artwork ────────────────────────────────────
export function DesignArtworkBar({ artwork, projectId }: { artwork: { id: string; title: string; description: string; sourceName: string; /** A placeholder: nothing uploaded yet. */ empty?: boolean }; projectId: string }) {
  const { pending, error, setError, run, router } = useRun();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: artwork.title, description: artwork.description });
  const [progress, setProgress] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const replace = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const pages = await uploadFile(file, setProgress);
      run(() => replaceDesignArtworkPages(artwork.id, pages, file.name));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That file couldn't be read.");
    } finally {
      setProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <section className="rounded-xl border border-line bg-card p-3">
      {editing ? (
        <div className="grid gap-2">
          <label className="text-[12px] font-semibold text-muted" htmlFor="edit-artwork-title">Title
            <input id="edit-artwork-title" value={draft.title} maxLength={160} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={`mt-1 ${field}`} />
          </label>
          <label className="text-[12px] font-semibold text-muted" htmlFor="edit-artwork-desc">Notes for reviewers (optional)
            <textarea id="edit-artwork-desc" value={draft.description} rows={2} maxLength={1000} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className={`mt-1 ${field}`} />
          </label>
          <div className="flex gap-2">
            <button type="button" disabled={pending || !draft.title.trim()} onClick={() => run(() => updateDesignArtwork(artwork.id, draft), () => setEditing(false))} className={primary}>Save</button>
            <button type="button" onClick={() => setEditing(false)} className={ghost}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-bold text-fg"><span>{artwork.title}</span></h2>
            {artwork.description && <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-muted">{artwork.description}</p>}
            {artwork.sourceName && <p className="mt-0.5 text-[11.5px] text-subtle">{artwork.sourceName}</p>}
          </div>
          <button type="button" onClick={() => setEditing(true)} className={ghost}><Pencil size={12} /> Edit</button>
          <input ref={fileRef} id="replace-artwork-file" type="file" accept={ACCEPT} hidden aria-label="Replace with a new file" onChange={(e) => replace(e.target.files?.[0])} />
          {artwork.empty ? (
            <button type="button" disabled={!!progress || pending} onClick={() => fileRef.current?.click()} className={primary}>{progress ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} {progress ?? "Upload the artwork"}</button>
          ) : (
          <ConfirmPopover message="Replace with a new version?" detail="Comments stay where they are. Everyone's seen and OK marks, and the approval, start again." confirmLabel="Choose file" onConfirm={() => fileRef.current?.click()}>
            {(o) => <button type="button" disabled={!!progress || pending} onClick={o} className={ghost}>{progress ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} {progress ?? "Replace file"}</button>}
          </ConfirmPopover>
          )}
          <ConfirmPopover message={`Delete “${artwork.title}”?`} detail="Its comments and review marks go too." confirmLabel="Delete" tone="danger" onConfirm={() => run(() => deleteDesignArtwork(artwork.id), () => router.push(`${BASE}?p=${projectId}`))}>
            {(o) => <button type="button" onClick={o} className={ghost}><Trash2 size={12} /> Delete</button>}
          </ConfirmPopover>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-[12.5px] font-semibold text-rose-600">{error}</p>}
    </section>
  );
}
