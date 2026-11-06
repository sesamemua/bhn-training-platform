"use client";

import { useEffect, useState, type ComponentProps, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, FilePlus, History, Link2, MessageSquare, Printer, Save, Trash2 } from "lucide-react";
import { PageReviewClient } from "@/components/workspace/PageReviewClient";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { REPORT_API, reportSchema, type Registration, type Report, type ReportPage, type ReportPhoto } from "@/lib/symposium-report/document";
import { ReportPaper, ReportRuler, useReportLayout, type Frame } from "./ReportPaper";
import { MIN_FILL_PHOTO, pagePhoto, photoPreset, portraitHeight, stripPhotos } from "@/lib/symposium-report/photos";
import { PhotoEditor } from "./ReportPhoto";
import styles from "./report.module.css";
import "./report-print.css";

type Review = ComponentProps<typeof PageReviewClient>["initialReview"];
type Props = {
  report: Report;
  history: { round: number; report: Report }[];
  review: Review;
  revision: string;
  recommendations: Record<string, ReportPhoto[]>;
  meId: string;
  isAdmin: boolean;
};
type Edit = { kind: "cover"; data: Report["cover"] } | { kind: "back"; data: Report["back"] } | { kind: "story"; data: ReportPage }
  | { kind: "photo"; frame: Frame; initial?: ReportPhoto; automatic: ReportPhoto; height: number; slot?: string };
const cover: Frame = { id: "cover", index: 0 };

function ChartFields({ chart, onChange }: { chart: Registration; onChange: (chart: Registration) => void }) {
  return (
    <fieldset className={styles.chartFields}>
      <legend>Registration chart</legend>
      {chart.categories.map((category, index) => {
        const update = (patch: Partial<typeof category>) => onChange({
          ...chart, categories: chart.categories.map((item, i) => i === index ? { ...item, ...patch } : item),
        });
        return (
          <div key={index}>
            <label>Category {index + 1}<input required maxLength={72} value={category.label} onChange={(e) => update({ label: e.target.value })} /></label>
            <label>Count {index + 1}<input required type="number" min={0} max={100_000} value={category.count} onChange={(e) => update({ count: Number(e.target.value) })} /></label>
          </div>
        );
      })}
      <label>What was counted?<input required maxLength={36} value={chart.unit} onChange={(e) => onChange({ ...chart, unit: e.target.value })} /></label>
      <label>Data source<textarea aria-label="Data source" required rows={3} maxLength={210} value={chart.source} onChange={(e) => onChange({ ...chart, source: e.target.value })} /></label>
    </fieldset>
  );
}

export function ReportEditor({ report: initial, revision, history, review, recommendations, meId, isAdmin }: Props) {
  const router = useRouter();
  const { confirmDialog, node } = useConfirmDialog();
  const [report, setReport] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [token, setToken] = useState(revision);
  const [past, setPast] = useState<number | null>(null);
  const [active, setActive] = useState<Frame>(cover);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [tab, setTab] = useState<"pages" | "comments">("comments");
  const [quote, setQuote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [transitioning, setTransitioning] = useState(false);

  const document = history.find((version) => version.round === past)?.report ?? report;
  const { layout, ruler } = useReportLayout(document);
  const editable = past === null && review.status === "open" && !transitioning;
  const approved = review.status === "closed" && (past === null || past === review.round);
  const dirty = report !== saved;
  const chapter = layout?.find(({ page }) => page.id === active.id);
  const count = layout ? 2 + layout.reduce((sum, item) => sum + item.frames.length, 0) : 0;
  const label = chapter?.page.title ?? (active.id === "back" ? "Back cover" : "Cover");

  useEffect(() => {
    if (!dirty && !edit) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, edit]);

  function select(frame: Frame, scroll = false) {
    if (edit) return;
    setActive(frame);
    setQuote("");
    if (scroll) window.document.getElementById(`report-frame-${frame.id}-${frame.index}`)?.scrollIntoView({ block: "start" });
  }

  function startEdit(frame: Frame) {
    if (busy || edit || !editable) return;
    select(frame);
    const page = report.pages.find((p) => p.id === frame.id);
    if (frame.id === "cover") setEdit({ kind: "cover", data: report.cover });
    else if (frame.id === "back") setEdit({ kind: "back", data: report.back });
    else if (page) setEdit({ kind: "story", data: page });
    requestAnimationFrame(() => {
      window.document.getElementById(`report-frame-${frame.id}-${frame.index}`)?.scrollIntoView({ block: "start" });
      window.document.querySelector<HTMLElement>("[data-report-edit-form] input")?.focus({ preventScroll: true });
    });
  }

  function apply(event: FormEvent) {
    event.preventDefault();
    if (!edit || edit.kind === "photo") return;
    const next = edit.kind === "story"
      ? { ...report, pages: report.pages.map((p) => p.id === edit.data.id ? edit.data : p) }
      : { ...report, [edit.kind]: edit.data };
    const result = reportSchema.safeParse(next);
    if (!result.success) { setError(result.error.issues[0]?.message ?? "Check the draft text."); return; }
    if (JSON.stringify(report) !== JSON.stringify(result.data)) setReport(result.data);
    setActive({ ...active, index: 0 });
    setEdit(null);
    setError("");
    setMessage("Changes applied. Save the draft to share them.");
  }

  function startPhoto(frame: Frame, slot?: string) {
    if (busy || edit || !editable) return;
    const entry = layout?.find(({ page }) => page.id === frame.id);
    const current = entry?.page.photos?.[slot ?? String(frame.index)];
    if ((frame.id !== "cover" && !entry) || (slot && !current)) return;
    select(frame);
    const recommended = entry
      ? pagePhoto({ ...entry.page, photos: undefined }, frame.index, recommendations)
      : recommendations.cover?.[0] ?? photoPreset("cover.jpg");
    const automatic = slot ? current ?? recommended : recommended;
    const existingHeight = entry?.photoHeights[frame.index] ?? 0;
    setEdit({
      kind: "photo", frame, automatic, slot,
      initial: entry ? current ?? (existingHeight ? undefined : automatic) : report.cover.photo,
      height: entry && slot ? portraitHeight(stripPhotos(entry.page, frame.index).length) : entry ? Math.max(MIN_FILL_PHOTO, existingHeight) : 385,
    });
    requestAnimationFrame(() => {
      window.document.getElementById(`report-frame-${frame.id}-${frame.index}`)?.scrollIntoView({ block: "start" });
      window.document.querySelector<HTMLElement>("[data-report-photo-picker]")?.focus({ preventScroll: true });
    });
  }

  function applyPhoto(photo: ReportPhoto | undefined) {
    if (edit?.kind !== "photo") return;
    const { frame } = edit;
    if (frame.id === "cover") setReport({ ...report, cover: { ...report.cover, photo } });
    else setReport({ ...report, pages: report.pages.map((page) => {
      if (page.id !== frame.id) return page;
      const photos = { ...page.photos };
      const key = edit.slot ?? String(frame.index);
      if (photo) photos[key] = photo;
      else if (edit.slot || (frame.index > 0 && photos[key] && stripPhotos(page, frame.index).length)) photos[key] = edit.automatic;
      else delete photos[key];
      return { ...page, photos };
    }) });
    setEdit(null);
    setError("");
    setMessage("Photo applied. Save the draft to share it.");
  }

  function addPage() {
    const id = window.crypto.randomUUID();
    const index = active.id === "cover" ? 0 : active.id === "back"
      ? report.pages.length : report.pages.findIndex((p) => p.id === active.id) + 1;
    const pages = [...report.pages];
    pages.splice(index, 0, { id, label: "2026 Symposium", title: "Untitled section", text: "", frames: 1 });
    setReport({ ...report, pages });
    setActive({ id, index: 0 });
    requestAnimationFrame(() => window.document.getElementById(`report-frame-${id}-0`)?.scrollIntoView({ block: "start" }));
  }

  function changeFrames(frames: number) {
    if (!chapter) return;
    setReport({ ...report, pages: report.pages.map((p) => p.id === chapter.page.id ? { ...p, frames } : p) });
    setActive({ ...active, index: 0 });
  }

  async function removePage() {
    if (!chapter) return;
    if (active.index > 0) {
      changeFrames(Math.max(1, Math.min(chapter.page.frames - 1, chapter.frames.length - 1)));
      return;
    }
    if (!await confirmDialog({
      title: `Remove “${chapter.page.title}”?`,
      description: "This removes the section and its linked pages from the draft. Saved earlier rounds keep their copies.",
      confirmLabel: "Remove section", cancelLabel: "Keep section", tone: "destructive",
    })) return;
    setReport({ ...report, pages: report.pages.filter((p) => p.id !== chapter.page.id) });
    setActive(cover);
  }

  async function write(action: "save" | "advance" | "approve") {
    if (busy || edit || transitioning || (action !== "save" && dirty)) return;
    if (action !== "save" && !await confirmDialog({
      title: action === "approve" ? `Approve Round ${review.round}?` : `Start Round ${review.round + 1}?`,
      description: action === "approve"
        ? "The approved copy will be locked and ready for PDF export."
        : "The saved report is archived, outstanding threads are marked resolved, and the next round opens for edits.",
      confirmLabel: action === "approve" ? "Approve report" : "Start round", cancelLabel: "Cancel", tone: "warning",
    })) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await fetch(REPORT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, round: review.round, revision: token, ...(action === "save" ? { report } : {}) }),
      });
      const body = await result.json().catch(() => null);
      if (!result.ok) throw new Error(body?.error ?? "The report could not be saved. Try again.");
      if (action === "save") {
        setToken(body.revision);
        setSaved(report);
        setMessage("Draft saved for all reviewers.");
      } else {
        setTransitioning(true);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The report could not be saved. Try again.");
    } finally { setBusy(false); }
  }

  function commentOn(frame: Frame) {
    const selection = window.getSelection();
    const sheet = window.document.getElementById(`report-frame-${frame.id}-${frame.index}`);
    const selected = sheet && selection?.anchorNode && selection.focusNode
      && sheet.contains(selection.anchorNode) && sheet.contains(selection.focusNode) ? selection.toString().trim() : "";
    setActive(frame);
    setQuote(selected.slice(0, 600));
    setTab("comments");
    requestAnimationFrame(() => window.document.getElementById("report-comments")?.scrollIntoView({ block: "nearest" }));
  }

  const controlsDisabled = !editable || !!edit || busy;
  const removable = chapter && (active.index === 0 ? report.pages.length > 1 : active.index === chapter.frames.length - 1 && chapter.page.frames === chapter.frames.length && !chapter.frames.at(-1)?.length);
  const editForm = edit?.kind === "photo" ? (
    <PhotoEditor initial={edit.initial} automatic={edit.automatic} height={edit.height} section={edit.frame.id}
      cover={edit.frame.id === "cover"} secondary={!!edit.slot} portrait={edit.slot?.startsWith("portrait-") ?? false}
      onApply={applyPhoto} onCancel={() => setEdit(null)} />
  ) : edit && (
    <form className={`${styles.editForm} report-screen-only`} data-report-edit-form="" onSubmit={apply}
      onKeyDown={(event) => { if (event.key === "Escape") setEdit(null); }}>
      <div className={styles.editHeader}>
        <div><p>{edit.kind === "story" ? "Linked text frames" : "Cover layout"}</p><h2>Edit {edit.kind === "story" ? "this section" : edit.kind === "cover" ? "the cover" : "the back cover"}</h2></div>
        <button type="button" onClick={() => setEdit(null)}>Cancel</button>
      </div>
      {edit.kind === "story" ? <>
        <label>Section label<input required maxLength={42} value={edit.data.label} onChange={(e) => setEdit({ ...edit, data: { ...edit.data, label: e.target.value } })} /></label>
        <label>Title<input required maxLength={100} value={edit.data.title} onChange={(e) => setEdit({ ...edit, data: { ...edit.data, title: e.target.value } })} /></label>
        <label className={styles.storyLabel}>Story text
          <textarea maxLength={16_000} value={edit.data.text} onChange={(e) => setEdit({ ...edit, data: { ...edit.data, text: e.target.value } })} aria-describedby="report-story-help" />
        </label>
        <p id="report-story-help">Leave a blank line between paragraphs. Begin a paragraph with <code>## </code> for a subhead or <code>&gt; </code> for an editorial note. Text flows into linked pages when you apply it.</p>
        {edit.data.registration && <ChartFields chart={edit.data.registration} onChange={(registration) => setEdit({ ...edit, data: { ...edit.data, registration } })} />}
      </> : edit.kind === "cover" ? <>
        <label>Title<input required maxLength={86} value={edit.data.title} onChange={(e) => setEdit({ ...edit, data: { ...edit.data, title: e.target.value } })} /></label>
        <label>Theme<textarea required rows={3} maxLength={120} value={edit.data.theme} onChange={(e) => setEdit({ ...edit, data: { ...edit.data, theme: e.target.value } })} /></label>
        <label>Date<input required maxLength={70} value={edit.data.date} onChange={(e) => setEdit({ ...edit, data: { ...edit.data, date: e.target.value } })} /></label>
      </> : <>
        <label>Title<input required maxLength={100} value={edit.data.title} onChange={(e) => setEdit({ ...edit, data: { ...edit.data, title: e.target.value } })} /></label>
        <label>Closing copy<textarea required rows={4} maxLength={260} value={edit.data.text} onChange={(e) => setEdit({ ...edit, data: { ...edit.data, text: e.target.value } })} /></label>
      </>}
      {error && <p role="alert">{error}</p>}
      <button type="submit" className={styles.primary}>Apply to page</button>
    </form>
  );

  return (
    <>
      <div className={`${styles.toolbar} report-screen-only`}>
        <div className={styles.reviewState}>
          <span>{review.status === "closed" ? "Approved" : "In review"} · Round {review.round}</span>
          <p>{count ? `${count} pages` : "Laying out pages"} · US Letter · {dirty ? "Unsaved changes" : "Shared draft"}</p>
        </div>
        <div className={styles.actions}>
          {history.length > 0 && (
            <label className={styles.history}><History size={15} /><select aria-label="Report round version" value={past ?? ""} disabled={!!edit || busy}
              onChange={(e) => { setPast(e.target.value ? Number(e.target.value) : null); setActive(cover); }}>
              <option value="">Current copy</option>
              {history.map(({ round }) => <option key={round} value={round}>Round {round} snapshot</option>)}
            </select></label>
          )}
          {editable && <button type="button" className={styles.primary} disabled={controlsDisabled || !dirty} onClick={() => write("save")}><Save size={15} /> Save draft</button>}
          {isAdmin && past === null && (
            <button type="button" disabled={!!edit || busy || dirty || transitioning} onClick={() => write("advance")}>Start Round {review.round + 1}</button>
          )}
          {isAdmin && editable && <button type="button" disabled={controlsDisabled || dirty} onClick={() => write("approve")}>Approve report</button>}
          {approved && layout && <button type="button" className={styles.primary} onClick={() => window.print()}><Printer size={15} /> Print / Save PDF</button>}
        </div>
      </div>
      <div className="report-screen-only">
        {error && !edit && <p className={styles.error} role="alert">{error}</p>}
        {message && <p className={styles.status} role="status">{message}</p>}
        {past !== null && <p className={styles.status}>Viewing the saved Round {past} snapshot. Switch to Current copy to make edits.</p>}
      </div>
      <div className={styles.workbench}>
        <aside className={`${styles.rail} report-screen-only`} aria-label="Report controls">
          <div className={styles.tabs}>
            <button type="button" aria-pressed={tab === "pages"} onClick={() => setTab("pages")}><BookOpen size={15} /> Pages</button>
            <button type="button" aria-pressed={tab === "comments"} onClick={() => setTab("comments")}><MessageSquare size={15} /> Review</button>
          </div>
          {tab === "pages" && <>
            <nav className={styles.outline} aria-label="Report pages">
              <button type="button" aria-current={active.id === "cover" ? "page" : undefined} disabled={!!edit} onClick={() => select(cover, true)}>Cover</button>
              {layout?.flatMap(({ page, frames }) => frames.map((_, index) =>
                <button type="button" key={`${page.id}:${index}`} disabled={!!edit} data-continuation={index > 0}
                  aria-current={active.id === page.id && active.index === index ? "page" : undefined} onClick={() => select({ id: page.id, index }, true)}>
                  {index === 0 ? page.title : `↳ Linked page ${index + 1}`}
                </button>
              ))}
              <button type="button" aria-current={active.id === "back" ? "page" : undefined} disabled={!!edit} onClick={() => select({ id: "back", index: 0 }, true)}>Back cover</button>
            </nav>
            {editable && <div className={styles.pageActions}>
              <button type="button" disabled={controlsDisabled || report.pages.length >= 40} onClick={addPage}><FilePlus size={15} /> Add page</button>
              {chapter && <button type="button" disabled={controlsDisabled || chapter.frames.length >= 20} onClick={() => changeFrames(chapter.frames.length + 1)}><Link2 size={15} /> Add linked page</button>}
              {removable && <button type="button" disabled={controlsDisabled} onClick={removePage}><Trash2 size={15} /> {active.index === 0 ? "Remove section" : "Remove linked page"}</button>}
              <p>Linked pages share one story. Extra pages appear as the text grows.</p>
            </div>}
          </>}
          {tab === "comments" && <label className={styles.reviewJump}>Jump to page
            <select aria-label="Jump to page" value={`${active.id}:${active.index}`} disabled={!!edit} onChange={(e) => {
              const [id, index] = e.target.value.split(":");
              select({ id, index: Number(index) }, true);
            }}>
              <option value="cover:0">Cover</option>
              {layout?.flatMap(({ page, frames }) => frames.map((_, index) => <option key={`${page.id}:${index}`}
                value={`${page.id}:${index}`}>{page.title}{index > 0 ? ` · continued ${index + 1}` : ""}</option>))}
              <option value="back:0">Back cover</option>
            </select>
          </label>}
          <div id="report-comments" hidden={tab !== "comments"}>
            <PageReviewClient initialReview={review} meId={meId} isAdmin={isAdmin}
              reportAnchor={{ label, quote, readOnly: past !== null, key: `#report-frame-${active.id}-${active.index}` }} />
          </div>
        </aside>
        {layout && <ReportPaper report={document} layout={layout} active={active} ready={approved} recommendations={recommendations}
          onSelect={select} edit={editForm} onEdit={controlsDisabled ? undefined : startEdit}
          onPhoto={controlsDisabled ? undefined : startPhoto}
          onComment={past === null && review.status === "open" && !edit ? commentOn : undefined} />}
        <ReportRuler ruler={ruler} />
      </div>
      {node}
    </>
  );
}
