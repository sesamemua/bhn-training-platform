"use client";

import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, FilePlus, GitCompare, History, Link2, LockKeyhole, MessageSquare, Printer, Trash2 } from "lucide-react";
import { PageReviewClient } from "@/components/workspace/PageReviewClient";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { REPORT_API, reportSchema, type Report, type ReportPhoto } from "@/lib/symposium-report/document";
import { Marked, ReportPaper, ReportRuler, useReportLayout, type Frame } from "./ReportPaper";
import { baselineOf, reportFields, type ReportChanges } from "@/lib/symposium-report/changes";
import { mergeReports } from "@/lib/symposium-report/merge";
import { hasTrainingPhotoGrid, MIN_FILL_PHOTO, pagePhoto, photoPreset, portraitHeight, stripPhotos, TRAINING_TILE_PREVIEW_HEIGHT, workshopTileHeight } from "@/lib/symposium-report/photos";
import { PhotoEditor } from "./ReportPhoto";
import { ReportReviewShare } from "./ReportReviewShare";
import { ReportPresence } from "./ReportPresence";
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
  fullPageReview?: boolean;
};
type PhotoEdit = { frame: Frame; initial?: ReportPhoto; automatic: ReportPhoto; height: number; slot?: string };
const cover: Frame = { id: "cover", index: 0 };

export function ReportEditor({ report: initial, revision, history, review: initialReview, recommendations, meId, isAdmin, fullPageReview = false }: Props) {
  const router = useRouter();
  const [review, setReview] = useState(initialReview);
  const [nextRoundReady, setNextRoundReady] = useState(initialReview.status === "exported" && !initialReview.comments.some(c => !c.parentId && c.status === "open"));
  const { confirmDialog, node } = useConfirmDialog();
  const [report, setReport] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [token, setToken] = useState(revision);
  const [past, setPast] = useState<number | null>(null);
  const [active, setActive] = useState<Frame>(cover);
  const [edit, setEdit] = useState<PhotoEdit | null>(null);
  const [typing, setTyping] = useState(false);
  const [tab, setTab] = useState<"pages" | "comments" | "changes">(fullPageReview ? "pages" : "comments");
  const [showChanges, setShowChanges] = useState(false);
  const [changes, setChanges] = useState<ReportChanges | null>(null);
  const [changesError, setChangesError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [transitioning, setTransitioning] = useState(false);
  const [saving, setSaving] = useState(false);
  /** The draft the last autosave failed on; autosave waits for the next edit (or a retry) instead of looping. */
  const [failedOn, setFailedOn] = useState<Report | null>(null);
  const [commentDraft, setCommentDraft] = useState(false);
  const [syncMessage, setSyncMessage] = useState("Checking for team updates…");
  const latest = useRef({ report, typing, saved, edit, saving, busy, token });
  useEffect(() => { latest.current = { report, typing, saved, edit, saving, busy, token }; });

  const document = history.find((version) => version.round === past)?.report ?? report;
  const editable = fullPageReview && past === null && review.status === "open" && !transitioning;
  const approved = review.status === "closed" && (past === null || past === review.round);
  const { layout, ruler } = useReportLayout(document, approved);
  const ready = !!layout;
  const dirty = report !== saved || typing || saving;
  const chapter = layout?.find(({ page }) => page.id === active.id);
  const count = layout ? 2 + layout.reduce((sum, item) => sum + item.frames.length, 0) : 0;
  const label = chapter?.page.title ?? (active.id === "back" ? "Back cover" : "Cover");
  const savedFields = useMemo(() => new Map(reportFields(saved).map((field) => [field.key, field.text])), [saved]);
  // Show changes: each field is compared with the start of the round; editing pauses while it is on.
  const markup = showChanges && changes && past === null ? (key: string) => baselineOf(changes, key, savedFields.get(key)) : undefined;

  async function loadChanges() {
    setChangesError("");
    try {
      const response = await fetch(REPORT_API, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Changes could not be loaded. Try again.");
      setChanges(body as ReportChanges);
    } catch (err) {
      setChangesError(err instanceof Error ? err.message : "Changes could not be loaded. Try again.");
    }
  }

  useEffect(() => {
    if (!fullPageReview || !ready || past !== null) return;
    let live = true, checking = false;
    const unfinished = () => {
      const current = latest.current;
      return (window.document.activeElement instanceof HTMLElement && window.document.activeElement.isContentEditable) || current.typing || current.report !== current.saved || current.edit || current.saving || current.busy ||
        window.document.querySelector('[data-report-comments-dirty="true"]');
    };
    async function check() {
      if (checking) return;
      if (unfinished()) { setSyncMessage("Your work is protected. Team updates will load after you finish."); return; }
      checking = true;
      try {
        const response = await fetch(`${REPORT_API}/review?document=1`, { cache: "no-store" });
        const body = await response.json();
        if (!live) return;
        if (!response.ok) throw new Error();
        if (!body.report || !body.review) return;
        if (body.review.round !== review.round) { setTransitioning(true); setSyncMessage("A new review round is available. Finish your work, then reload this page."); return; }
        if (unfinished()) return;
        setReview((current) => current.status === body.review.status ? current : { ...current, status: body.review.status });
        if (body.revision !== latest.current.token) {
          const next = reportSchema.safeParse(body.report);
          if (!next.success) throw new Error();
          setReport(next.data); setSaved(next.data); setToken(body.revision);
          void loadChanges();
        }
        setSyncMessage("Live updates connected · checks every 5 seconds");
      } catch { if (live) setSyncMessage("Team updates are temporarily unavailable. Your local work is protected; retrying…"); }
      finally { checking = false; }
    }
    void check();
    const initialChanges = window.setTimeout(() => void loadChanges(), 0);
    const timer = window.setInterval(() => void check(), 5000);
    const foreground = () => { if (window.document.visibilityState === "visible") void check(); };
    window.document.addEventListener("visibilitychange", foreground);
    return () => { live = false; window.clearTimeout(initialChanges); window.clearInterval(timer); window.document.removeEventListener("visibilitychange", foreground); };
  // The timer reads editing state from latest, without restarting during typing.
  }, [fullPageReview, ready, past, review.round]);

  function toggleChanges(on: boolean) {
    if (on && window.document.activeElement instanceof HTMLElement) window.document.activeElement.blur();
    setShowChanges(on);
    if (on) { setTab("changes"); void loadChanges(); }
  }

  /** "Structured Networking, p. 12" for a frame id such as "structured-networking-0". */
  function pageName(frame: string) {
    if (frame === "cover-0") return "Cover, p. 1";
    if (frame === "back-0") return `Back cover, p. ${count}`;
    const hit = /^(.+)-(\d+)$/.exec(frame);
    let folio = 1;
    for (const entry of layout ?? []) {
      if (entry.page.id === hit?.[1]) return `${entry.page.title}, p. ${folio + 1 + Number(hit[2])}`;
      folio += entry.frames.length;
    }
    return "another page";
  }

  function jumpToFrame(frame: string) {
    const hit = /^(.+)-(\d+)$/.exec(frame);
    if (hit) select({ id: hit[1], index: Number(hit[2]) }, true);
  }

  function jumpToField(key: string) {
    const id = key.startsWith("page:") ? key.split(":")[1] : key.split(".")[0];
    select({ id, index: 0 }, true);
  }

  useEffect(() => {
    const syncReview = (event: Event) => {
      const next = (event as CustomEvent<{ round: number; status: string; nextRoundReady?: boolean }>).detail;
      if (!next || !["open", "exported", "closed"].includes(next.status)) return;
      if (next.round !== review.round) { setTransitioning(true); return; }
      if (typeof next.nextRoundReady === "boolean") setNextRoundReady(next.nextRoundReady);
      setReview((current) => current.status === next.status ? current : { ...current, status: next.status });
    };
    const draftState = (event: Event) => setCommentDraft(!!(event as CustomEvent<boolean>).detail);
    window.addEventListener("bhn-report-review-state", syncReview);
    window.addEventListener("bhn-report-comment-draft", draftState);
    return () => { window.removeEventListener("bhn-report-review-state", syncReview); window.removeEventListener("bhn-report-comment-draft", draftState); };
  }, [review.round]);

  useEffect(() => {
    if (!fullPageReview || !ready) return;
    const script = window.document.createElement("script");
    script.src = `${REPORT_API}/review?overlay=1`;
    script.dataset.round = String(past ?? review.round);
    script.onerror = () => setError("The review panel could not load. Reload the review to try again.");
    window.document.head.appendChild(script);
    return () => {
      script.remove();
      (window as Window & { __bhnReviewCleanup?: () => void }).__bhnReviewCleanup?.();
    };
  }, [fullPageReview, ready, review.round, past]);

  useEffect(() => {
    if (!dirty && !edit && !commentDraft) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, edit, commentDraft]);

  async function save() {
    const sent = report;
    setSaving(true);
    try {
      const result = await fetch(REPORT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", round: review.round, revision: token, report: sent }),
      });
      const body = await result.json().catch(() => null);
      if (result.ok) { setToken(body.revision); setSaved(sent); setError(""); void loadChanges(); return; }
      const current = result.status === 409 ? reportSchema.safeParse(body?.current) : null;
      if (current?.success && typeof body?.revision === "string") {
        // A colleague saved first: merge their copy with this draft, then the next pass saves the result.
        if (latest.current.typing) return; // merge once the box being typed in is left
        const merged = reportSchema.safeParse(mergeReports(saved, latest.current.report, current.data));
        setSaved(current.data);
        setToken(body.revision);
        if (merged.success) setReport(JSON.stringify(merged.data) === JSON.stringify(current.data) ? current.data : merged.data);
        return;
      }
      setFailedOn(sent);
      setError(body?.error ?? "The report could not be saved.");
    } catch {
      setFailedOn(sent);
      setError("Changes couldn’t be saved. Retrying…");
      window.setTimeout(() => setFailedOn(null), 5000);
    } finally { setSaving(false); }
  }

  // Autosave shortly after each finished edit (text commits when you leave the box).
  useEffect(() => {
    if (!editable || saving || typing || report === saved || failedOn === report) return;
    const timer = window.setTimeout(() => void save(), 800);
    return () => window.clearTimeout(timer);
  });
  // Leaving the tab commits the box being typed in, so it autosaves too.
  useEffect(() => {
    const commit = () => {
      const focused = window.document.activeElement;
      if (window.document.visibilityState === "hidden" && focused instanceof HTMLElement && focused.isContentEditable) focused.blur();
    };
    window.document.addEventListener("visibilitychange", commit);
    return () => window.document.removeEventListener("visibilitychange", commit);
  }, []);

  function select(frame: Frame, scroll = false) {
    if (edit) return;
    setActive(frame);
    if (scroll) window.document.getElementById(`report-frame-${frame.id}-${frame.index}`)?.scrollIntoView({ block: "start" });
  }

  function applyText(next: Report) {
    const result = reportSchema.safeParse(next);
    if (!result.success) { setError(result.error.issues[0]?.message ?? "Check the draft text."); return; }
    if (JSON.stringify(report) !== JSON.stringify(result.data)) setReport(result.data);
    setError("");
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
      height = slot.startsWith("workshop-") ? 684 * workshopTileHeight(entry.page) / 337 : hasTrainingPhotoGrid(entry.page, frame.index)
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
  }

  function removePhoto() {
    if (!edit || edit.frame.id === "cover") return;
    const { frame, slot } = edit;
    setReport({ ...report, pages: report.pages.map((page) => {
      if (page.id !== frame.id) return page;
      const photos = { ...page.photos };
      // Extra photos just go; the main slot keeps a hidden marker so no recommended photo fills it.
      if (slot) delete photos[slot];
      else photos[String(frame.index)] = { ...pagePhoto(page, frame.index, recommendations), hidden: true };
      return { ...page, photos };
    }) });
    setEdit(null);
    setError("");
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
    if (commentDraft) { setError("Finish or clear your comment drafts before changing linked pages."); return; }
    if (!chapter) return;
    setReport({ ...report, pages: report.pages.map((p) => p.id === chapter.page.id ? { ...p, frames } : p) });
    setActive({ ...active, index: 0 });
  }

  async function removePage() {
    if (commentDraft) { setError("Finish or clear your comment drafts before removing pages."); return; }
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

  async function write(action: "advance" | "approve") {
    if (busy || edit || dirty || transitioning) return;
    if (!await confirmDialog({
      title: action === "approve" ? `Approve Round ${review.round}?` : `Start Round ${review.round + 1}?`,
      description: action === "approve"
        ? "The approved copy will be locked and ready for PDF export."
        : "Only start the next round once the current round’s revisions are complete. The saved report is archived, outstanding threads are marked resolved, and the next round opens for edits.",
      confirmLabel: action === "approve" ? "Approve report" : "Start round", cancelLabel: "Cancel", tone: "warning",
    })) return;
    setBusy(true);
    setError("");
    try {
      const result = await fetch(REPORT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, round: review.round, revision: token }),
      });
      const body = await result.json().catch(() => null);
      if (!result.ok) throw new Error(body?.error ?? "The report could not be saved. Try again.");
      setTransitioning(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The report could not be saved. Try again.");
    } finally { setBusy(false); }
  }

  const controlsDisabled = !editable || !!edit || busy;
  const removable = chapter && (active.index === 0 ? report.pages.length > 1 : active.index === chapter.frames.length - 1 && chapter.page.frames === chapter.frames.length && !chapter.frames.at(-1)?.length);
  const editForm = edit && (
    <PhotoEditor initial={edit.initial} automatic={edit.automatic} height={edit.height} section={edit.frame.id}
      cover={edit.frame.id === "cover"} secondary={!!edit.slot} portrait={edit.slot?.startsWith("portrait-") ?? false}
      onApply={applyPhoto} onRemove={edit.frame.id === "cover" ? undefined : removePhoto} onCancel={() => setEdit(null)} />
  );

  return (
    <>
      {review.status === "exported" && <section className={`${styles.lockedRound} report-screen-only`} role="status" data-ready={nextRoundReady || undefined} aria-label={nextRoundReady ? `Round ${review.round + 1} ready for review` : `Round ${review.round} locked`}>
        {nextRoundReady ? <BookOpen size={30} aria-hidden="true" /> : <LockKeyhole size={26} aria-hidden="true" />}
        <div>
          <h2>{nextRoundReady ? `Round ${review.round + 1} is ready for review` : `Round ${review.round} is locked`}</h2>
          {nextRoundReady ? <>
            <p>All revision requests are resolved. Round {review.round} remains locked to preserve its review record.</p>
            <ol>
              <li>An administrator must click “Start Round {review.round + 1} review” in the full-page review.</li>
              <li>Once it opens, reviewers can edit text and photos, add comments, and @mention colleagues.</li>
            </ol>
          </> : <>
            <p>Comments have been copied. Editing and commenting are paused while this round’s revisions are completed.</p>
            <ol>
              <li>Wait until the revisions for Round {review.round} are complete.</li>
              <li>Then an administrator can start Round {review.round + 1} to resume editing and commenting.</li>
            </ol>
          </>}
          {!fullPageReview && <p>Use the red review button to open the full-page review and manage the next round.</p>}
          {dirty && <p>Your unsaved local edits remain in this tab; copy them before reloading.</p>}
        </div>
      </section>}
      <div className={`${styles.toolbar} report-screen-only`}>
        <div className={styles.reviewState}>
          <span>{review.status === "closed" ? "Approved" : review.status === "exported" ? nextRoundReady ? `Round ${review.round + 1} ready for review` : "Round locked" : "In review"} · Round {review.round}</span>
          <p>{count ? `${count} pages` : "Laying out pages"} · US Letter · <span role="status">{saving ? "Saving…" : dirty ? "Editing" : editable ? "All changes saved" : "Shared draft"}</span></p>
          {editable && <p>Click text to edit, click a photo for photo tools, or use the nearby comment icon to leave feedback. Edits save automatically.</p>}
          {!fullPageReview && <p>{nextRoundReady ? `View only. Open Round ${review.round + 1} review, then an administrator can start it.` : `View only. Use the red “Start Round ${review.round} review” button to comment or edit the report.`}</p>}
        </div>
        <div className={styles.actions}>
          {history.length > 0 && (
            <label className={styles.history}><History size={15} /><select aria-label="Report round version" value={past ?? ""} disabled={!!edit || busy || commentDraft}
              onChange={(e) => { setPast(e.target.value ? Number(e.target.value) : null); setActive(cover); }}>
              <option value="">Current copy</option>
              {history.map(({ round }) => <option key={round} value={round}>Round {round} snapshot</option>)}
            </select></label>
          )}
          {fullPageReview && isAdmin && past === null && (
            <button type="button" disabled={!!edit || busy || dirty || commentDraft || transitioning} className={nextRoundReady ? styles.reviewLaunch : undefined} onClick={() => write("advance")}>Start Round {review.round + 1} review</button>
          )}
          {isAdmin && editable && <button type="button" disabled={controlsDisabled || dirty || commentDraft} onClick={() => write("approve")}>Approve report</button>}
          {approved && layout && <button type="button" className={styles.primary} onClick={() => window.print()}><Printer size={15} /> Print / Save PDF</button>}
          <label className={styles.trackToggle} title={past !== null ? "Switch to Current copy to see changes." : "Mark what changed this round"}>
            <input type="checkbox" role="switch" checked={showChanges} disabled={past !== null || !!edit || commentDraft} onChange={(event) => toggleChanges(event.target.checked)} />
            Show changes
          </label>
        </div>
        {fullPageReview && <p className={styles.status} role="status">{syncMessage}</p>}
        <ReportPresence endpoint={`${REPORT_API}/presence`} pageName={pageName} onJump={jumpToFrame} unsaved={dirty || commentDraft} showVersion={fullPageReview} />
        {!fullPageReview && <ReportReviewShare round={review.round} nextRoundReady={nextRoundReady} revision={token} canInvite={past === null && review.status === "open" && !busy && !dirty && !transitioning} />}
      </div>
      <div className="report-screen-only">
        {error && !edit && <p className={styles.error} role="alert">{error}</p>}
        {past !== null && <p className={styles.status}>Viewing the saved Round {past} snapshot. Switch to Current copy to make edits.</p>}
        {markup && <p className={styles.status} role="status">
          Showing changes since {changes!.since === "round" ? `Round ${changes!.round} started` : "change tracking began"}: <ins className={styles.ins}>added</ins> · <del className={styles.del}>removed</del>. Turn off Show changes to edit.
        </p>}
        {showChanges && changesError && <p className={styles.error} role="alert">{changesError}</p>}
      </div>
      <div className={`${styles.workbench} ${fullPageReview ? styles.fullPageReview : ""}`} data-report-workbench="" data-report-unsaved={dirty || !!edit || busy}>
        {fullPageReview && <aside className={`${styles.rail} ${styles.reviewRail} report-screen-only`} aria-label="Report review tools">
          <div data-report-tools-host="" />
        </aside>}
        <aside className={`${styles.rail} ${fullPageReview ? styles.navigationRail : ""} report-screen-only`} aria-label={fullPageReview ? "Report navigation" : "Report controls"}>
          <div className={styles.tabs}>
            <button type="button" aria-pressed={tab === "pages"} onClick={() => setTab("pages")}><BookOpen size={15} /> Pages</button>
            {!fullPageReview && <button type="button" aria-pressed={tab === "comments"} onClick={() => setTab("comments")}><MessageSquare size={15} /> Review</button>}
            <button type="button" aria-pressed={tab === "changes"} onClick={() => { setTab("changes"); if (!changes) void loadChanges(); }}><GitCompare size={15} /> Changes</button>
            {fullPageReview && <span data-report-mentions-host="" className={styles.mentionsHost} />}
          </div>
          {tab === "changes" && <section className={styles.changeList} aria-label="Changes this round">
            {!changes ? <p className={styles.status}>{changesError || "Loading changes…"}</p>
              : changes.edits.length === 0 ? <p className={styles.status}>No saved text changes in Round {changes.round} yet.</p>
              : <ol>{changes.edits.map((entry) => <li key={entry.id}>
                <p><strong>{entry.author}</strong> <time dateTime={entry.at}>{new Date(entry.at).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}</time></p>
                {entry.fields.map((field) => <div key={field.key}>
                  <button type="button" disabled={!!edit} onClick={() => jumpToField(field.key)}>{field.label}</button>
                  <p className={styles.changeText}><Marked parts={field.marks} /></p>
                </div>)}
              </li>)}</ol>}
          </section>}
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
          {!fullPageReview && <div id="report-comments" hidden={tab !== "comments"}>
            <p className={styles.status}>Comments are view only here. Use the red review button above to open the full-page review. Editing and commenting are available only in an open round.</p>
            <PageReviewClient initialReview={review} meId={meId} isAdmin={isAdmin}
              reportAnchor={{ label, quote: "", readOnly: true, key: `#report-frame-${active.id}-${active.index}`,
                onLocate: (key) => {
                  const hit = /^#report-frame-(.+)-(\d+)$/.exec(key);
                  if (hit) select({ id: hit[1], index: Number(hit[2]) });
                } }} />
          </div>}
        </aside>
        {layout && <ReportPaper report={document} layout={layout} active={active} ready={approved} recommendations={recommendations}
          onSelect={select} edit={editForm} onTextChange={controlsDisabled || markup ? undefined : applyText} onTyping={setTyping}
          onPhoto={controlsDisabled || markup ? undefined : startPhoto} markup={markup} reviewTools={fullPageReview} changes={changes ?? undefined} trackChanges={showChanges} onTrackChanges={past === null && !edit && !busy && !commentDraft ? toggleChanges : undefined} />}
        <ReportRuler ruler={ruler} />
      </div>
      {node}
    </>
  );
}
