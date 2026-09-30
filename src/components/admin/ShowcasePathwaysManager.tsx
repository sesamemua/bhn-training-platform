"use client";

/**
 * Admin manager for showcase PATHWAYS → COHORTS, on /admin/showcase.
 * Create a pathway once (named with no number); add auto-numbered cohorts
 * under it, each with its own public /showcase/<slug> link. Legacy
 * standalone showcases (no pathway) are listed in their own section.
 */
import { useState, useEffect } from "react";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  Plus,
  Copy,
  Check,
  ExternalLink,
  Trash2,
  Loader2,
  X,
  Layers,
  Pencil,
  UserPlus,
  Users,
} from "lucide-react";

type Cohort = {
  id: string;
  slug: string;
  name: string;
  cohortNumber: number | null;
  active: boolean;
  submissionCount: number;
  linkedCohortId: string | null;
  gateOnAttendance: boolean;
};
type Pathway = {
  id: string;
  slug: string;
  name: string;
  eyebrow: string | null;
  intro: string | null;
  linkedPathwayId: string | null;
  cohorts: Cohort[];
};
type Standalone = {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  submissionCount: number;
};

export function ShowcasePathwaysManager({
  initialPathways,
  initialStandalone,
}: {
  initialPathways: Pathway[];
  initialStandalone: Standalone[];
}) {
  const [pathways, setPathways] = useState(initialPathways);
  const [standalone, setStandalone] = useState(initialStandalone);
  // Which group's people roster is expanded (keyed by group SLUG).
  const [rosterFor, setRosterFor] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", eyebrow: "", intro: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();
  const [copied, setCopied] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  // Keyed by cohort/group SLUG (unique across both pathway cohorts and
  // standalone groups) rather than id, since the "Add person" toggle is
  // driven from CohortRow which only knows the slug.
  const [addingPersonFor, setAddingPersonFor] = useState<string | null>(null);

  /** Optimistic bump after a manual add succeeds — mirrors the pattern
   *  used by toggleCohort/patchCohort above (no full page reload, so an
   *  admin can add several people back-to-back without losing their
   *  place). The submissions grid below picks up the new row on the
   *  next real page load / its own "Refresh list" action. */
  function adjustCount(slug: string, delta: number) {
    setPathways((ps) =>
      ps.map((p) => ({
        ...p,
        cohorts: p.cohorts.map((c) =>
          c.slug === slug ? { ...c, submissionCount: Math.max(0, c.submissionCount + delta) } : c,
        ),
      })),
    );
    setStandalone((s) =>
      s.map((g) => (g.slug === slug ? { ...g, submissionCount: Math.max(0, g.submissionCount + delta) } : g)),
    );
  }
  const bumpCount = (slug: string) => adjustCount(slug, 1);

  const publicUrl = (slug: string) =>
    `${typeof window !== "undefined" ? window.location.origin : ""}/showcase/${slug}`;

  async function copyLink(slug: string) {
    try {
      await navigator.clipboard.writeText(publicUrl(slug));
      setCopied(slug);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* clipboard blocked */
    }
  }

  async function createPathway(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/showcase/pathways", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json().catch(() => ({}))) as {
        pathway?: Pathway;
        error?: string;
      };
      if (!res.ok || !data.pathway) {
        throw new Error(data.error ?? "Couldn't create the pathway.");
      }
      const np = data.pathway as Pathway;
      setPathways((p) => [
        { ...np, linkedPathwayId: np.linkedPathwayId ?? null, cohorts: np.cohorts ?? [] },
        ...p,
      ]);
      setForm({ name: "", eyebrow: "", intro: "" });
      setCreating(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function patchPathway(id: string, patch: Partial<Pathway>) {
    setPathways((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    await fetch(`/api/admin/showcase/pathways/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => {});
  }

  async function deletePathway(p: Pathway) {
    if (
      !(await confirmDialog({
        title: `Delete the pathway "${p.name}"?`,
        description: p.cohorts.length > 0 ? `Its ${p.cohorts.length} cohort(s) become standalone showcases — they keep their links and submissions.` : undefined,
        confirmLabel: "Delete",
        tone: "destructive",
      }))
    ) {
      return;
    }
    setStandalone((s) => [
      ...p.cohorts.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        active: c.active,
        submissionCount: c.submissionCount,
      })),
      ...s,
    ]);
    setPathways((ps) => ps.filter((x) => x.id !== p.id));
    await fetch(`/api/admin/showcase/pathways/${p.id}`, { method: "DELETE" }).catch(
      () => {},
    );
  }

  async function addCohort(pathwayId: string) {
    setAdding(pathwayId);
    try {
      const res = await fetch(
        `/api/admin/showcase/pathways/${pathwayId}/cohorts`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      );
      const data = (await res.json().catch(() => ({}))) as { cohort?: Cohort };
      if (data.cohort) {
        const nc: Cohort = {
          ...(data.cohort as Cohort),
          linkedCohortId: null,
          gateOnAttendance: false,
        };
        setPathways((ps) =>
          ps.map((p) =>
            p.id === pathwayId ? { ...p, cohorts: [...p.cohorts, nc] } : p,
          ),
        );
      }
    } finally {
      setAdding(null);
    }
  }

  async function toggleCohort(
    pathwayId: string | null,
    id: string,
    active: boolean,
  ) {
    if (pathwayId) {
      setPathways((ps) =>
        ps.map((p) =>
          p.id === pathwayId
            ? { ...p, cohorts: p.cohorts.map((c) => (c.id === id ? { ...c, active } : c)) }
            : p,
        ),
      );
    } else {
      setStandalone((s) => s.map((g) => (g.id === id ? { ...g, active } : g)));
    }
    await fetch(`/api/admin/showcase/groups/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    }).catch(() => {});
  }

  async function deleteCohort(
    pathwayId: string | null,
    id: string,
    slug: string,
    count: number,
  ) {
    if (
      !(await confirmDialog({
        title: `Delete "${slug}"?`,
        description: count > 0 ? `It has ${count} submission(s) — those stay in the dashboard, but the link stops accepting new entries.` : undefined,
        confirmLabel: "Delete",
        tone: "destructive",
      }))
    ) {
      return;
    }
    if (pathwayId) {
      setPathways((ps) =>
        ps.map((p) =>
          p.id === pathwayId
            ? { ...p, cohorts: p.cohorts.filter((c) => c.id !== id) }
            : p,
        ),
      );
    } else {
      setStandalone((s) => s.filter((g) => g.id !== id));
    }
    await fetch(`/api/admin/showcase/groups/${id}`, { method: "DELETE" }).catch(
      () => {},
    );
  }

  const empty = pathways.length === 0 && standalone.length === 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-line/70 bg-card-solid">
      {confirmNode}
      <header className="flex items-center justify-between gap-3 border-b border-line/60 px-5 py-3.5">
        <div>
          <h2 className="text-[13.5px] font-semibold text-fg">
            Showcase pathways
          </h2>
          <p className="text-[12px] text-fg-subtle">
            One pathway per program; add cohorts under it. Each cohort has its own{" "}
            <strong className="font-semibold text-fg">public upload link</strong> —{" "}
            <strong className="font-semibold text-fg">Copy upload link</strong> and send it to graduates;
            they add their own name, LinkedIn &amp; headshot (no login needed) and are auto-tagged to that cohort.
          </p>
        </div>
        <button
          onClick={() => setCreating((c) => !c)}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-brand-700"
        >
          {creating ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {creating ? "Cancel" : "New pathway"}
        </button>
      </header>

      {creating && (
        <form
          onSubmit={createPathway}
          className="space-y-2.5 border-b border-line/60 bg-raised/15 px-5 py-4"
        >
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Pathway name — e.g. Medical Affairs Learning Pathway"
            maxLength={160}
            className="w-full rounded-md border border-line bg-card-solid px-3 py-2 text-[13.5px] text-fg outline-none focus:border-brand-400"
          />
          <input
            value={form.eyebrow}
            onChange={(e) => setForm({ ...form, eyebrow: e.target.value })}
            placeholder="Eyebrow on the public page (defaults to the pathway name)"
            maxLength={160}
            className="w-full rounded-md border border-line bg-card-solid px-3 py-2 text-[13px] text-fg outline-none focus:border-brand-400"
          />
          <textarea
            value={form.intro}
            onChange={(e) => setForm({ ...form, intro: e.target.value })}
            placeholder="Intro blurb shown to submitters (shared by all cohorts)"
            rows={2}
            maxLength={600}
            className="w-full resize-y rounded-md border border-line bg-card-solid px-3 py-2 text-[13px] text-fg outline-none focus:border-brand-400"
          />
          {error && <p className="text-[12.5px] text-rose-600">{error}</p>}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-fg-subtle">
              No cohort number here — you add cohorts (Cohort 1, 2, …) next.
            </p>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Create pathway
            </button>
          </div>
        </form>
      )}

      {empty ? (
        <p className="px-5 py-6 text-center text-[13px] text-fg-subtle">
          No pathways yet — create one, then add its cohorts.
        </p>
      ) : (
        <div className="divide-y divide-line/50">
          {pathways.map((p) => (
            <div key={p.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-brand-600" />
                    <span className="text-[14px] font-semibold text-fg">
                      {p.name}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => addCohort(p.id)}
                    disabled={adding === p.id}
                    className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1.5 text-[11.5px] font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
                  >
                    {adding === p.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    Add cohort
                  </button>
                  <button
                    onClick={() => setEditing(editing === p.id ? null : p.id)}
                    className="rounded-md border border-line bg-card-solid p-1.5 text-fg-muted transition hover:text-fg"
                    title="Edit pathway"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => deletePathway(p)}
                    className="rounded-md border border-line bg-card-solid p-1.5 text-fg-muted transition hover:border-rose-300 hover:text-rose-600"
                    title="Delete pathway"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {editing === p.id && (
                <EditPathway
                  pathway={p}
                  onSave={(patch) => {
                    patchPathway(p.id, patch);
                    setEditing(null);
                  }}
                  onCancel={() => setEditing(null)}
                />
              )}

              <div className="ml-6 mt-2.5 space-y-1.5 border-l border-line/60 pl-4">
                {p.cohorts.length === 0 ? (
                  <p className="text-[12px] text-fg-subtle">
                    No cohorts yet — click “Add cohort”.
                  </p>
                ) : (
                  p.cohorts.map((c) => (
                    <div key={c.id} className="space-y-1">
                      <CohortRow
                        label={c.name}
                        slug={c.slug}
                        active={c.active}
                        count={c.submissionCount}
                        url={publicUrl(c.slug)}
                        copied={copied === c.slug}
                        onCopy={() => copyLink(c.slug)}
                        onToggle={() => toggleCohort(p.id, c.id, !c.active)}
                        onDelete={() =>
                          deleteCohort(p.id, c.id, c.slug, c.submissionCount)
                        }
                        onAddPerson={() =>
                          setAddingPersonFor(addingPersonFor === c.slug ? null : c.slug)
                        }
                        addPersonOpen={addingPersonFor === c.slug}
                        onToggleRoster={() =>
                          setRosterFor(rosterFor === c.slug ? null : c.slug)
                        }
                        rosterOpen={rosterFor === c.slug}
                      />
                      {addingPersonFor === c.slug && (
                        <AddSubmissionForm
                          slug={c.slug}
                          onAdded={() => bumpCount(c.slug)}
                          onClose={() => setAddingPersonFor(null)}
                        />
                      )}
                      {rosterFor === c.slug && (
                        <RosterPanel slug={c.slug} onRemoved={() => adjustCount(c.slug, -1)} />
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}

          {standalone.length > 0 && (
            <div className="px-5 py-4">
              <p className="mb-2 text-[11.5px] font-medium uppercase tracking-[0.14em] text-fg-subtle">
                Other showcases (no pathway)
              </p>
              <div className="space-y-1.5">
                {standalone.map((g) => (
                  <div key={g.id} className="space-y-1">
                    <CohortRow
                      label={g.name}
                      slug={g.slug}
                      active={g.active}
                      count={g.submissionCount}
                      url={publicUrl(g.slug)}
                      copied={copied === g.slug}
                      onCopy={() => copyLink(g.slug)}
                      onToggle={() => toggleCohort(null, g.id, !g.active)}
                      onDelete={() =>
                        deleteCohort(null, g.id, g.slug, g.submissionCount)
                      }
                      onAddPerson={() =>
                        setAddingPersonFor(addingPersonFor === g.slug ? null : g.slug)
                      }
                      addPersonOpen={addingPersonFor === g.slug}
                      onToggleRoster={() =>
                        setRosterFor(rosterFor === g.slug ? null : g.slug)
                      }
                      rosterOpen={rosterFor === g.slug}
                    />
                    {addingPersonFor === g.slug && (
                      <AddSubmissionForm
                        slug={g.slug}
                        onAdded={() => bumpCount(g.slug)}
                        onClose={() => setAddingPersonFor(null)}
                      />
                    )}
                    {rosterFor === g.slug && (
                      <RosterPanel slug={g.slug} onRemoved={() => adjustCount(g.slug, -1)} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function CohortRow({
  label,
  slug,
  active,
  count,
  url,
  copied,
  onCopy,
  onToggle,
  onDelete,
  onAddPerson,
  addPersonOpen,
  onToggleRoster,
  rosterOpen,
}: {
  label: string;
  slug: string;
  active: boolean;
  count: number;
  url: string;
  copied: boolean;
  onCopy: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onAddPerson: () => void;
  addPersonOpen: boolean;
  onToggleRoster: () => void;
  rosterOpen: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-raised/20">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-fg">{label}</span>
          <span
            className={[
              "rounded-full px-2 py-0.5 text-[10px] font-medium",
              active ? "bg-emerald-50 text-emerald-800" : "bg-line/50 text-fg-subtle",
            ].join(" ")}
          >
            {active ? "Open" : "Closed"}
          </span>
          <span className="text-[11px] text-fg-subtle">
            {count} submission{count === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <code className="truncate text-[11px] text-brand-700">/showcase/{slug}</code>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-fg-subtle transition hover:text-brand-700"
            title="Open public page"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          onClick={onAddPerson}
          className={[
            "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition",
            addPersonOpen
              ? "border-brand-400 bg-brand-50 text-brand-700"
              : "border-line bg-card-solid text-fg hover:border-brand-400 hover:text-brand-700",
          ].join(" ")}
          title="Manually add a person to this showcase — bypasses the public form and any attendance gate"
        >
          <UserPlus className="h-3 w-3" /> Add person
        </button>
        <button
          onClick={onToggleRoster}
          disabled={count === 0}
          className={[
            "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition disabled:opacity-40",
            rosterOpen
              ? "border-brand-400 bg-brand-50 text-brand-700"
              : "border-line bg-card-solid text-fg hover:border-brand-400 hover:text-brand-700",
          ].join(" ")}
          title={count === 0 ? "No people yet" : "View and remove people in this showcase"}
        >
          <Users className="h-3 w-3" /> People
        </button>
        <button
          onClick={onCopy}
          title="Copy this cohort's public upload link — send it to graduates so they add their name, LinkedIn & headshot themselves (no login needed)"
          className="inline-flex items-center gap-1 rounded-md border border-line bg-card-solid px-2 py-1 text-[11px] font-medium text-fg transition hover:border-brand-400 hover:text-brand-700"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> Copy upload link
            </>
          )}
        </button>
        <button
          onClick={onToggle}
          className="rounded-md border border-line bg-card-solid px-2 py-1 text-[11px] font-medium text-fg transition hover:border-brand-400"
        >
          {active ? "Close" : "Open"}
        </button>
        <button
          onClick={onDelete}
          className="rounded-md border border-line bg-card-solid p-1 text-fg-muted transition hover:border-rose-300 hover:text-rose-600"
          title="Delete"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

/** Manual "add a person" panel for one cohort/group. Hits the admin-only
 *  submission route (bypasses the public form's `active` flag and
 *  attendance gate). Stays open and clears its fields after a successful
 *  add so an admin can enter a whole roster back-to-back — e.g. from a
 *  printed sign-in sheet. */
function AddSubmissionForm({
  slug,
  onAdded,
  onClose,
}: {
  slug: string;
  onAdded: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [note, setNote] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  function pickPhoto(file: File | null) {
    setPhotoFile(file);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!name.trim() || !linkedin.trim() || !photoFile) {
      setError("Name, LinkedIn, and a photo are all required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("programSlug", slug);
      fd.set("name", name.trim());
      fd.set("linkedin", linkedin.trim());
      if (note.trim()) fd.set("note", note.trim());
      fd.set("photo", photoFile);
      const res = await fetch("/api/admin/showcase/submissions", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't add this person.");
      setJustAdded(name.trim());
      setName("");
      setLinkedin("");
      setNote("");
      pickPhoto(null);
      onAdded();
      setTimeout(() => setJustAdded(null), 2500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="ml-2 space-y-2 rounded-md border border-line/70 bg-raised/15 p-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
          Add a person to /{slug}
        </span>
        <button type="button" onClick={onClose} className="text-fg-subtle transition hover:text-fg">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
          maxLength={120}
          className="min-w-[10rem] flex-1 rounded-md border border-line bg-card-solid px-2.5 py-1.5 text-[12.5px] text-fg outline-none focus:border-brand-400"
        />
        <input
          value={linkedin}
          onChange={(e) => setLinkedin(e.target.value)}
          placeholder="LinkedIn handle or URL"
          maxLength={200}
          className="min-w-[12rem] flex-1 rounded-md border border-line bg-card-solid px-2.5 py-1.5 text-[12.5px] text-fg outline-none focus:border-brand-400"
        />
      </div>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-line bg-card-solid px-2.5 py-1.5 text-[11.5px] text-fg-muted transition hover:border-brand-400">
        {photoPreview ? (
          // eslint-disable-next-line @next/next/no-img-element -- tiny local preview, matches ShowcaseSubmitForm's pattern
          <img src={photoPreview} alt="" className="h-6 w-6 rounded-full object-cover" />
        ) : (
          <span>Headshot photo…</span>
        )}
        {photoFile && <span className="max-w-[10rem] truncate text-fg">{photoFile.name}</span>}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)}
        />
      </label>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder='Note (optional) — e.g. "from the printed sign-in sheet"'
        maxLength={200}
        className="w-full rounded-md border border-line bg-card-solid px-2.5 py-1.5 text-[12px] text-fg outline-none focus:border-brand-400"
      />
      {error && <p className="text-[11.5px] text-rose-600">{error}</p>}
      {justAdded && (
        <p className="text-[11.5px] font-medium text-emerald-700">
          Added {justAdded} ✓ — add the next person, or close.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
          Add person
        </button>
      </div>
    </form>
  );
}

/** Expandable roster for one showcase group: lists the people in it and lets
 *  an admin remove any of them (hard-delete of the ShowcaseSubmission + its
 *  headshot, via the same endpoint the flat grid uses). */
function RosterPanel({ slug, onRemoved }: { slug: string; onRemoved: () => void }) {
  type Person = { id: string; name: string; linkedin: string; photoUrl: string };
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();

  useEffect(() => {
    let live = true;
    fetch(`/api/admin/showcase/submissions?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d: { people?: Person[] }) => { if (live) setPeople(d.people ?? []); })
      .catch(() => { if (live) setError("Couldn't load the roster."); });
    return () => { live = false; };
  }, [slug]);

  async function remove(p: Person) {
    if (!(await confirmDialog({ title: `Remove ${p.name} from this showcase?`, description: "This deletes their entry and headshot — it can't be undone.", confirmLabel: "Remove", tone: "destructive" }))) return;
    setRemoving(p.id);
    try {
      const res = await fetch(`/api/admin/showcase/${p.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setPeople((ps) => (ps ?? []).filter((x) => x.id !== p.id));
      onRemoved();
    } catch {
      setError(`Couldn't remove ${p.name}.`);
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="ml-2 space-y-1 rounded-md border border-line/70 bg-raised/15 p-2.5">
      {confirmNode}
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">People in /{slug}</span>
      {error && <p className="text-[11.5px] text-rose-600">{error}</p>}
      {people === null ? (
        <p className="flex items-center gap-1.5 py-1 text-[12px] text-fg-subtle"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</p>
      ) : people.length === 0 ? (
        <p className="py-1 text-[12px] text-fg-subtle">No people in this showcase yet.</p>
      ) : (
        <ul className="space-y-0.5">
          {people.map((p) => (
            <li key={p.id} className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-raised/30">
              {/* eslint-disable-next-line @next/next/no-img-element -- small admin thumbnail from R2 */}
              <img src={p.photoUrl} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
              <span className="flex-1 truncate text-[12.5px] text-fg">{p.name}</span>
              <a href={p.linkedin} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[11px] text-brand-700 hover:underline">LinkedIn</a>
              <button
                onClick={() => remove(p)}
                disabled={removing === p.id}
                className="shrink-0 rounded-md border border-line bg-card-solid p-1 text-fg-muted transition hover:border-rose-300 hover:text-rose-600 disabled:opacity-50"
                title={`Remove ${p.name}`}
              >
                {removing === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EditPathway({
  pathway,
  onSave,
  onCancel,
}: {
  pathway: Pathway;
  onSave: (p: Partial<Pathway>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(pathway.name);
  const [eyebrow, setEyebrow] = useState(pathway.eyebrow ?? "");
  const [intro, setIntro] = useState(pathway.intro ?? "");
  return (
    <div className="ml-6 mt-2 space-y-2 rounded-md border border-line/70 bg-raised/15 p-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={160}
        className="w-full rounded-md border border-line bg-card-solid px-3 py-1.5 text-[13px] text-fg outline-none focus:border-brand-400"
      />
      <input
        value={eyebrow}
        onChange={(e) => setEyebrow(e.target.value)}
        maxLength={160}
        placeholder="Eyebrow"
        className="w-full rounded-md border border-line bg-card-solid px-3 py-1.5 text-[12.5px] text-fg outline-none focus:border-brand-400"
      />
      <textarea
        value={intro}
        onChange={(e) => setIntro(e.target.value)}
        rows={2}
        maxLength={600}
        placeholder="Intro blurb"
        className="w-full resize-y rounded-md border border-line bg-card-solid px-3 py-1.5 text-[12.5px] text-fg outline-none focus:border-brand-400"
      />
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-md border border-line px-3 py-1.5 text-[12px] font-medium text-fg transition hover:border-line-strong"
        >
          Cancel
        </button>
        <button
          onClick={() =>
            onSave({
              name: name.trim() || pathway.name,
              eyebrow: eyebrow.trim() || null,
              intro: intro.trim() || null,
            })
          }
          className="rounded-md bg-brand-600 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-brand-700"
        >
          Save
        </button>
      </div>
    </div>
  );
}
