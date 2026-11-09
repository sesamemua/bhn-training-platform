"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, FilePlus, History, Link2, MessageSquare, Printer, Save, Trash2 } from "lucide-react";
import { PageReviewClient } from "@/components/workspace/PageReviewClient";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { REPORT_API, reportSchema, type Report, type ReportPhoto } from "@/lib/symposium-report/document";
import { ReportPaper, ReportRuler, useReportLayout, type Frame } from "./ReportPaper";
import { hasTrainingPhotoGrid, MIN_FILL_PHOTO, pagePhoto, photoPreset, portraitHeight, stripPhotos, TRAINING_TILE_PREVIEW_HEIGHT, workshopTileHeight } from "@/lib/symposium-report/photos";
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
type PhotoEdit = { frame: Frame; initial?: ReportPhoto; automatic: ReportPhoto; height: number; slot?: string };
const cover: Frame = { id: "cover", index: 0 };

export function ReportEditor({ report: initial, revision, history, review, recommendations, meId, isAdmin }: Props) {
  const router = useRouter();
  const { confirmDialog, node } = useConfirmDialog();
  const [report, setReport] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [token, setToken] = useState(revision);
  const [past, setPast] = useState<number | null>(null);
  const [active, setActive] = useState<Frame>(cover);
  const [edit, setEdit] = useState<PhotoEdit | null>(null);
  const [typing, setTyping] = useState(false);
  const [tab, setTab] = useState<"pages" | "comments">("comments");
  const [quote, setQuote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [transitioning, setTransitioning] = useState(false);

  const document = history.find((version) => version.round === past)?.report ?? report;
  const editable = past === null && review.status === "open" && !transitioning;
  const approved = review.status === "closed" && (past === null || past === review.round);
  const { layout, ruler } = useReportLayout(document, approved);
  const dirty = report !== saved || typing;
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

  function applyText(next: Report) {
    const result = reportSchema.safeParse(next);
    if (!result.success) { setError(result.error.issues[0]?.message ?? "Check the draft text."); return; }
    if (JSON.stringify(report) !== JSON.stringify(result.data)) setReport(result.data);
    setError("");
    setMessage("");
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
    let height = entry ? Math.max(MIN_FILL_PHOTO, existingHeight) : 438;
    if (entry && slot) {
      height = slot.startsWith("workshop-") ? 684 * workshopTileHeight(entry.page, slot.split("-")[1]) / 337 : hasTrainingPhotoGrid(entry.page, frame.index)
        ? TRAINING_TILE_PREVIEW_HEIGHT
        : portraitHeight(stripPhotos(entry.page, frame.index).length);
    }
    setEdit({
      frame, automatic, slot,
      initial: entry ? current ?? (existingHeight ? undefined : automatic) : report.cover.photo,
      height,
    });
    requestAnimationFrame(() => {
      window.document.getElementById(`report-frame-${frame.id}-${frame.index}`)?.scrollIntoView({ block: "start" });
      window.document.querySelector<HTMLElement>("[data-report-photo-picker]")?.focus({ preventScroll: true });
    });
  }

  function applyPhoto(photo: ReportPhoto | undefined) {
    if (!edit) return;
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
    if (busy || edit || typing || transitioning || (action === "save" ? !dirty : dirty)) return;
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
  const editForm = edit && (
    <PhotoEditor initial={edit.initial} automatic={edit.automatic} height={edit.height} section={edit.frame.id}
      cover={edit.frame.id === "cover"} secondary={!!edit.slot} portrait={edit.slot?.startsWith("portrait-") ?? false}
      onApply={applyPhoto} onCancel={() => setEdit(null)} />
  );

  return (
    <>
      <div className={`${styles.toolbar} report-screen-only`}>
        <div className={styles.reviewState}>
          <span>{review.status === "closed" ? "Approved" : "In review"} · Round {review.round}</span>
          <p>{count ? `${count} pages` : "Laying out pages"} · US Letter · {dirty ? "Unsaved changes" : "Shared draft"}</p>
          {editable && <p>Click the text to edit it on the page.</p>}
        </div>
        <div className={styles.actions}>
          {history.length > 0 && (
            <label className={styles.history}><History size={15} /><select aria-label="Report round version" value={past ?? ""} disabled={!!edit || busy}
              onChange={(e) => { setPast(e.target.value ? Number(e.target.value) : null); setActive(cover); }}>
              <option value="">Current copy</option>
              {history.map(({ round }) => <option key={round} value={round}>Round {round} snapshot</option>)}
            </select></label>
          )}
          {editable && <button type="button" className={styles.primary} disabled={controlsDisabled || !dirty}
            onPointerDown={() => { if (typing && window.document.activeElement instanceof HTMLElement) window.document.activeElement.blur(); }}
            onClick={() => write("save")}><Save size={15} /> Save draft</button>}
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
          onSelect={select} edit={editForm} onTextChange={controlsDisabled ? undefined : applyText} onTyping={setTyping}
          onPhoto={controlsDisabled ? undefined : startPhoto}
          onComment={past === null && review.status === "open" && !edit ? commentOn : undefined} />}
        <ReportRuler ruler={ruler} />
      </div>
      {node}
    </>
  );
}
