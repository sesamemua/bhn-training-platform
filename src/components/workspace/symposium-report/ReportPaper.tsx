"use client";

import { Fragment, useLayoutEffect, useRef, useState, type HTMLAttributes, type MouseEvent, type ReactNode } from "react";
import type { Registration, Report, ReportPage, ReportPhoto } from "@/lib/symposium-report/document";
import { paginate, replaceReportBlock, reportBlocks, type Block } from "@/lib/symposium-report/paginate";
import { hasLeadPhoto, hasPairedPhotos, hasTrainingPhotoGrid, MAX_PHOTO_HEIGHT, MIN_FILL_PHOTO, pagePhoto, photoLabel, photoRemoved, PHOTO_CAPTION_SPACE, PHOTO_GAP, photoPreset, photoRowHeight, portraitHeight, portraitPhotos, REPORT_ASSETS, stripPhotos, trainingPhotoGridSpace, TRAINING_TILE_PREVIEW_HEIGHT, workshopPhotos, workshopTileHeight } from "@/lib/symposium-report/photos";
import { marks as diffMarks, marksByRange, reportFields, type Mark, type ReportChanges } from "@/lib/symposium-report/changes";
import { changePassages } from "@/lib/symposium-report/change-passages";
import { ReportChangePopup } from "./ReportChangePopup";
import { CoverArt, PhotoFigure } from "./ReportPhoto";
import styles from "./report.module.css";
import { editorialParts, pairedProfile, publicationPage, quotePosition } from "@/lib/symposium-report/editorial";

const sectorColors = [
  "var(--report-sector-academic)", "var(--report-sector-industry)", "var(--report-sector-other)", "var(--report-sector-public)",
];

type Inline = (value: string, label: string, apply: (value: string) => void, multiline?: boolean) => HTMLAttributes<HTMLElement>;

function RegistrationChart({ chart, showSource, inline, change }: {
  chart: Registration; showSource: boolean; inline: Inline; change: (chart: Registration) => void;
}) {
  const categoryColors = chart.categories.map(({ label }, index) => sectorColors[label.startsWith("Government") ? 3 : label === "Other" ? 2 : index]);
  const total = chart.categories.reduce((sum, item) => sum + item.count, 0);
  const updateCategory = (index: number, patch: Partial<Registration["categories"][number]>) =>
    change({ ...chart, categories: chart.categories.map((item, i) => i === index ? { ...item, ...patch } : item) });
  return (
    <figure className={styles.registration} data-dual={chart.audience ? "true" : undefined}>
      <figcaption>{chart.percentagesOnly ? "Organization profile" : "Primary organizational affiliation"} {!chart.percentagesOnly && <span>{total.toLocaleString("en-CA")}{" "}
        <span {...inline(chart.unit, "What was counted?", (unit) => change({ ...chart, unit }))}>{chart.unit}</span>
      </span>}</figcaption>
      <div className={styles.chartRow}>
        <svg width="146" height="146" viewBox="0 0 42 42" aria-hidden="true">
          {chart.categories.map(({ count }, index) => {
            const share = count / total * 100;
            const offset = chart.categories.slice(0, index).reduce((sum, sector) => sum + sector.count / total * 100, 0);
            return <circle key={index} cx="21" cy="21" r="15.9154943" fill="none" stroke={categoryColors[index]} strokeWidth="8"
              pathLength="100" strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={-offset} transform="rotate(-90 21 21)" />;
          })}
          {!chart.percentagesOnly && <text x="21" y="23" textAnchor="middle" className={styles.chartTotal}>{total}</text>}
        </svg>
        <dl className={styles.chartLegend}>
          {chart.categories.map(({ count, label }, index) => (
            <div key={index}>
              <dt><i style={{ background: categoryColors[index] }} />
                <span {...inline(label, `Category ${index + 1}`, (label) => updateCategory(index, { label }))}>{label}</span>
              </dt>
              <dd>{!chart.percentagesOnly && <><span {...inline(String(count), `Count for ${label}`, (text) => updateCategory(index, { count: text.trim() ? Number(text) : NaN }))}>{count}</span> · </>}{(count / total * 100).toFixed(1)}%</dd>
            </div>
          ))}
        </dl>
      </div>
      {chart.audience && <div className={styles.audienceChart}>
        <h3>HQP and professional participation</h3>
        <div className={styles.chartRow}>
          <svg width="146" height="146" viewBox="0 0 42 42" aria-hidden="true">
            <circle cx="21" cy="21" r="15.9154943" fill="none" stroke={sectorColors[1]} strokeWidth="8" />
            <circle cx="21" cy="21" r="15.9154943" fill="none" stroke={sectorColors[0]} strokeWidth="8" pathLength="100"
              strokeDasharray={`${chart.audience.trainees / (chart.audience.trainees + chart.audience.professionals) * 100} 100`} transform="rotate(-90 21 21)" />
          </svg>
          <dl className={styles.chartLegend}>
            <div><dt><i style={{ background: sectorColors[0] }} />HQP</dt><dd>{(chart.audience.trainees / (chart.audience.trainees + chart.audience.professionals) * 100).toFixed(0)}%</dd></div>
            <div><dt><i style={{ background: sectorColors[1] }} />Professional</dt><dd>{(chart.audience.professionals / (chart.audience.trainees + chart.audience.professionals) * 100).toFixed(0)}%</dd></div>
          </dl>
        </div>
      </div>}
      {showSource && <aside className={styles.registrationSource}>
        <strong>For review only · Omitted from the final report</strong>
        <p {...inline(chart.source, "Registration data source", (source) => change({ ...chart, source }))}>{chart.source}</p>
        {chart.percentagesOnly && <div className={styles.sourceCounts}>
          {chart.categories.map(({ label, count }, index) => <label key={index}>{label}{" "}
            <span {...inline(String(count), `Count for ${label}`, (text) => updateCategory(index, { count: text.trim() ? Number(text) : NaN }))}>{count}</span>
          </label>)}
          {chart.audience && (["trainees", "professionals"] as const).map((key) => <label key={key}>{key === "trainees" ? "HQP" : "Professional"}{" "}
            <span {...inline(String(chart.audience![key]), `Count for ${key}`, (text) => change({ ...chart, audience: { ...chart.audience!, [key]: text.trim() ? Number(text) : NaN } }))}>{chart.audience![key]}</span>
          </label>)}
        </div>}
      </aside>}
    </figure>
  );
}

/** Tracked text: insertions underlined green, deletions struck red (as in social post changes). */
export function Marked({ parts }: { parts: Mark[] }) {
  return parts.map((part, i) => part.kind === "ins" ? <ins key={i} className={styles.ins}>{part.text}</ins>
    : part.kind === "del" ? <del key={i} className={styles.del}>{part.text}</del>
    : <Fragment key={i}>{part.text}</Fragment>);
}

function blockClassName(block: Block, rosterStart: number | undefined) {
  const roster = rosterStart !== undefined && block.start >= rosterStart;
  return `${styles[block.kind]}${roster ? ` ${styles[block.kind === "heading" ? "rosterHeading" : "rosterNames"]}` : ""}`;
}

function Blocks({ page, blocks, inline, change, tracked, heights = {} }: { page: ReportPage; blocks: Block[]; inline: Inline; change: (block: Block, text: string) => void; tracked?: Map<number, Mark[]>; heights?: Record<string, number> }) {
  const rosterStart = page.id === "structured-networking" ? reportBlocks(page.text).findLast((block) => block.kind === "heading" && block.text === "Participating industry professionals")?.start : undefined;
  return blocks.map((block, index) => {
    const Tag = block.kind === "heading" && !block.continued ? "h3" : block.kind === "quote" ? "blockquote" : block.kind === "bullet" && !block.continued ? "li" : "p";
    const photos = workshopPhotos(page, block.photoRow);
    const position = quotePosition(page, block);
    const editProps = inline(block.text, block.kind === "heading" ? "Story subheading" : "Story text", (text) => change(block, text), block.kind !== "heading");
    // Keep the editable DOM as plain text; styled review spans belong to the reading view.
    // Chromium can mislay columns when a spanning layout block is directly editable.
    const copy = block.text && <Tag className={`${blockClassName(block, rosterStart)}${block.kind === "bullet" && block.continued ? ` ${styles.continuedBullet}` : ""}`} data-report-field={`page:${page.id}:text`} data-report-text-start={block.start} data-report-text-end={block.start + block.text.length} data-list-continuation={block.kind === "bullet" && block.continued || undefined} data-quote-role={position?.role} style={position ? { gridColumn: position.column, gridRow: position.row } : undefined} onClick={(event: MouseEvent<HTMLElement>) => {
      if (!(event.target as HTMLElement).closest('[contenteditable]')) event.currentTarget.querySelector<HTMLElement>('[contenteditable]')?.focus();
    }}>
      {page.id === "structured-networking" && block.kind === "quote" && <small className={styles.quoteRole}>{blockQuoteRole(page, block)}</small>}
      <span className={styles.textFrame}
        {...editProps}>
        {tracked?.get(block.start) ? <Marked parts={tracked.get(block.start)!} /> : editProps.contentEditable ? block.text : editorialParts(page, block).map((part, i) => <span key={i} className={part.kind ? styles[part.kind] : undefined}>{part.text}</span>)}
      </span>
    </Tag>;
    if (block.kind === "bullet" && !block.continued) return <ul key={index} className={styles.list}>{copy}</ul>;
    const figures = photos.map(([key, photo]) => <PhotoFigure key={key} slot={key} photo={photo} caption={page.showCaptions !== false} height={684 * (heights[block.photoRow ?? ""] ?? workshopTileHeight(page)) / 337} />);
    if (pairedProfile(page) && photos.length) return <div key={index} className={`${styles.ventureProfile}${publicationPage(page) ? ` ${styles.publicationProfile}` : ""}`}>{copy}<div>{figures}</div></div>;
    return <Fragment key={index}>
      {copy}
      {photos.length > 0 && <div className={styles.workshopPhotos} role="group" aria-label="Workshop photographs">{figures}</div>}
    </Fragment>;
  });
}

const folioText = (number: number) => String(number).padStart(2, "0");

const quoteRole = (text: string) => /\u2014 (Alex Kamp|Jasmine Hamilton|Morty Soley)/.test(text) ? "Mentor" : /\u2014 (Sunny Peiwei|Xunuo Cao|Maidah)/.test(text) ? "HQP" : "Program staff";

const blockQuoteRole = (page: ReportPage, block: Block) => quoteRole(reportBlocks(page.text).find(b => b.kind === "quote" && b.start <= block.start && b.start + b.text.length >= block.start + block.text.length)?.text ?? block.text);

export type LaidOutReport = { workshopHeights?: Record<string, number>[]; page: ReportPage; columns: 1 | 2; frames: Block[][]; photoHeights: number[]; hasWorkshops: boolean }[];

export function useReportLayout(report: Report, approved: boolean) {
  const ruler = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<LaidOutReport | null>(null);
  useLayoutEffect(() => {
    const host = ruler.current;
    if (!host) return;
    const pageNode = host.firstElementChild as HTMLElement;
    pageNode.dataset.reviewDraft = String(!approved);
    const intro = pageNode.querySelector<HTMLElement>("[data-measure-intro]")!;
    const title = intro.querySelector("h2")!;
    const label = intro.querySelector("span")!;
    const continuation = pageNode.querySelector<HTMLElement>("[data-measure-continuation]")!;
    const measure = pageNode.querySelector<HTMLElement>("[data-measure-copy]")!;
    const story = measure.firstElementChild as HTMLElement;
    const measureText = (page: ReportPage, blocks: Block[], index: number, hasStrip: boolean) => {
      pageNode.dataset.continued = String(index > 0);
      pageNode.dataset.photoStrip = String(hasStrip || hasPairedPhotos(page, index));
      pageNode.dataset.photoPair = String(hasPairedPhotos(page, index));
      const rosterStart = page.id === "structured-networking" ? reportBlocks(page.text).findLast((block) => block.kind === "heading" && block.text === "Participating industry professionals")?.start : undefined;
      story.replaceChildren(...blocks.flatMap((block) => {
        const node = document.createElement(block.kind === "heading" && !block.continued ? "h3" : block.kind === "quote" ? "blockquote" : block.kind === "bullet" && !block.continued ? "li" : "p");
        node.className = `${blockClassName(block, rosterStart)}${block.kind === "bullet" && block.continued ? ` ${styles.continuedBullet}` : ""}`;
        if (page.id === "structured-networking" && block.kind === "quote") { node.dataset.quoteRole = blockQuoteRole(page, block); const role = document.createElement("small"); role.className = styles.quoteRole; role.textContent = blockQuoteRole(page, block); node.append(role); }
        const text = document.createElement("span");
        text.className = styles.textFrame;
        for (const part of editorialParts(page, block)) { const span = document.createElement("span"); span.className = part.kind ? styles[part.kind] : ""; span.textContent = part.text; text.append(span); }
        const position = quotePosition(page, block);
        if (position) { node.style.gridColumn = position.column; node.style.gridRow = position.row; }
        node.append(text);
        const list = document.createElement("ul");
        list.className = styles.list;
        if (block.kind === "bullet" && !block.continued) list.append(node);
        const nodes: HTMLElement[] = block.text ? [block.kind === "bullet" && !block.continued ? list : node] : [];
        const photos = workshopPhotos(page, block.photoRow);
        if (photos.length) {
          const space = document.createElement("div");
          const height = workshopTileHeight(page);
          if (pairedProfile(page)) {
            const row = document.createElement("div");
            row.className = `${styles.ventureProfile}${publicationPage(page) ? ` ${styles.publicationProfile}` : ""}`;
            space.style.aspectRatio = publicationPage(page) ? "1 / 1" : `337 / ${height * photos.length}`;
            space.style.marginBottom = `${(page.showCaptions === false ? 0 : PHOTO_CAPTION_SPACE) * photos.length}px`;
            row.append(...nodes, space);
            return [row];
          }
          const rows = Math.ceil(photos.length / 2);
          space.style.height = `${rows * (height + (page.showCaptions === false ? 0 : PHOTO_CAPTION_SPACE)) + (rows - 1) * 10 + PHOTO_GAP}px`;
          nodes.push(space);
        }
        return nodes;
      }));
      return measure.clientHeight - parseFloat(getComputedStyle(measure).paddingBottom) - Math.ceil(story.getBoundingClientRect().height);
    };
    const result = report.pages.map((page, index) => {
      const blocks = reportBlocks(page.text);
      const hasWorkshops = blocks.some((block) => !!block.photoRow);
      const columns: 1 | 2 = !hasWorkshops && page.text.length >= 900 ? 2 : 1;
      story.classList.toggle(styles.workshopStory, hasWorkshops);
      pageNode.dataset.section = page.id;
      pageNode.dataset.audience = String(!!page.registration?.audience);
      pageNode.dataset.columns = String(columns);
      title.textContent = page.title;
      const pageIntro = intro.querySelector<HTMLElement>("[data-measure-page-intro]")!;
      pageIntro.textContent = page.intro ?? "";
      pageIntro.hidden = !page.intro;
      continuation.firstChild!.textContent = `${folioText(index + 1)} / ${page.title}`;
      label.textContent = `${folioText(index + 1)} / ${page.label}`;
      pageNode.dataset.figure = page.image === "registration" && page.registration ? "chart" : hasLeadPhoto(page, 0) ? "photo" : "none";
      const stripSpace = (index: number) => {
        if (hasTrainingPhotoGrid(page, index)) return trainingPhotoGridSpace(page, index);
        const count = stripPhotos(page, index).length;
        return count && !hasPairedPhotos(page, index) ? photoRowHeight(count) + (page.showCaptions === false ? 0 : 34) + PHOTO_GAP : 0;
      };
      const hasPortraits = portraitPhotos(page).length > 0;
      pageNode.dataset.portraits = String(hasPortraits);
      const workshopHeads = blocks.filter(b => b.kind === "heading");
      const breaks = page.id === "training-week" ? new Set(workshopHeads.slice(2).map(b => b.start)) : page.id === "discussion" ? new Set(workshopHeads.filter(b => !["Challenges", "Opportunities", "Discussion notes"].includes(b.text)).slice(1).map(b => b.start)) : undefined;
      const keepWhole = ["career-conversations", "structured-networking"].includes(page.id) ? new Set(blocks.filter(b => b.kind !== "heading").map(b => b.start)) : undefined;
      const frames = paginate(blocks, page.frames, (candidate, index) => {
        const reserve = !hasLeadPhoto(page, index) && !hasTrainingPhotoGrid(page, index) && page.photos?.[String(index)] && !photoRemoved(page, index)
          ? MIN_FILL_PHOTO + (page.showCaptions === false ? 0 : PHOTO_CAPTION_SPACE) + PHOTO_GAP : 0;
        const strip = stripSpace(index);
        return measureText(page, candidate, index, strip > 0) >= reserve + strip;
      }, breaks, keepWhole);
      const photoHeights = frames.map((blocks, index) => {
        if (photoRemoved(page, index)) return 0;
        if (page.fillPhotos === false && !hasLeadPhoto(page, index) && !page.photos?.[String(index)]) return 0;
        if (hasWorkshops && !page.photos?.[String(index)] && !hasLeadPhoto(page, index)) return 0;
        if (index === 0 && !blocks.length && !page.photos?.["0"] && !hasLeadPhoto(page, 0)) return 0;
        if (hasTrainingPhotoGrid(page, index)) return TRAINING_TILE_PREVIEW_HEIGHT;
        if (hasPairedPhotos(page, index)) return portraitHeight(2);
        const strip = stripSpace(index);
        const freeSpace = measureText(page, blocks, index, strip > 0) - strip;
        const maximum = page.photos?.[String(index)]?.fit === "whole" ? Infinity : MAX_PHOTO_HEIGHT;
        if (hasLeadPhoto(page, index)) {
          return Math.min(maximum, MIN_FILL_PHOTO + Math.max(0, freeSpace - 3));
        }
        if (strip && !page.photos?.[String(index)]) return 0;
        const space = freeSpace - (page.showCaptions === false ? 0 : PHOTO_CAPTION_SPACE) - PHOTO_GAP;
        return space >= MIN_FILL_PHOTO ? Math.min(maximum, space) : 0;
      });
      const workshopHeights = frames.map((frame, index) => {
        if (page.id !== "training-week") return {};
        const rows = frame.flatMap(b => b.photoRow ? [[b.photoRow, Math.ceil(workshopPhotos(page, b.photoRow).length / 2)] as const] : []);
        const count = rows.reduce((sum, [, n]) => sum + n, 0);
        const extra = count ? Math.max(0, Math.min(240, (measureText(page, frame, index, false) - 2) / count)) : 0;
        return Object.fromEntries(rows.map(([row]) => [row, workshopTileHeight(page) + extra]));
      });
      return { page, columns, frames, photoHeights, hasWorkshops, workshopHeights };
    });
    // Pagination uses the browser's actual font and frame measurements.
    setLayout(result);
  }, [report, approved]);
  return { layout, ruler };
}

export function ReportRuler({ ruler }: { ruler: React.Ref<HTMLDivElement> }) {
  return (
    <div className={styles.ruler} ref={ruler} aria-hidden="true">
      <div className={`${styles.paper} ${styles.chapter}`}>
        <header className={styles.chapterHead} data-measure-intro=""><span /><h2 /><p className={styles.pageIntro} data-measure-page-intro="" hidden /></header>
        <div className={styles.continuationHead} data-measure-continuation="">Title <span> / continued</span></div>
        <div className={styles.figureSpacer} />
        <div className={styles.copy} data-measure-copy=""><div className={styles.story} /></div>
        <div className={styles.folio} />
      </div>
    </div>
  );
}

export type Frame = { id: string; index: number };

export function ReportPaper({ report, layout, active, ready, onSelect, edit, onTextChange, onTyping, onPhoto, recommendations, markup, reviewTools = false, changes, trackChanges = false, onTrackChanges }: {
  report: Report;
  recommendations: Record<string, ReportPhoto[]>;
  layout: LaidOutReport;
  active: Frame;
  ready: boolean;
  onSelect: (frame: Frame) => void;
  edit: ReactNode;
  onTextChange?: (report: Report) => void;
  onTyping: (typing: boolean) => void;
  onPhoto?: (frame: Frame, slot?: string) => void;
  /** Show changes: the text each field is compared against (by changes.ts field key). */
  markup?: (key: string) => string;
  reviewTools?: boolean;
  changes?: ReportChanges;
  trackChanges?: boolean;
  onTrackChanges?: (value: boolean) => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [openChanges, setOpenChanges] = useState<string | null>(null);
  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setScale(Math.min(1, Math.max(0.2, entry.contentRect.width / 816))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const show = (key: string, text: string) => {
    const base = markup?.(key);
    return base === undefined || base === text ? text : <Marked parts={diffMarks(base, text)} />;
  };
  const tracked = (page: ReportPage, frames: Block[][]) => {
    const base = markup?.(`page:${page.id}:text`);
    if (base === undefined || base === page.text) return undefined;
    const blocks = frames.flat();
    const split = marksByRange(diffMarks(base, page.text), blocks.map((block) => [block.start, block.start + block.text.length]));
    return new Map(blocks.map((block, i) => [block.start, split[i]]));
  };
  const num = 2 + layout.reduce((sum, { frames }) => sum + frames.length, 0);
  const inline: Inline = (value, label, apply, multiline = false) => onTextChange ? {
    contentEditable: "plaintext-only",
    suppressContentEditableWarning: true,
    tabIndex: 0,
    role: "textbox",
    "aria-label": label,
    "aria-multiline": multiline,
    onInput: () => onTyping(true),
    onBlur: ({ currentTarget }) => {
      onTyping(false);
      if (currentTarget.textContent === value && !currentTarget.firstElementChild) return;
      const next = multiline ? currentTarget.innerText : currentTarget.textContent ?? "";
      currentTarget.textContent = value;
      if (next !== value) apply(next);
    },
    onKeyDown: (event) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Escape" || (!multiline && event.key === "Enter")) {
        event.preventDefault();
        if (event.key === "Escape") event.currentTarget.textContent = value;
        event.currentTarget.blur();
      }
    },
  } : {};
  const patchPage = (id: string, patch: (page: ReportPage) => Partial<ReportPage>) =>
    onTextChange?.({ ...report, pages: report.pages.map((page) => page.id === id ? { ...page, ...patch(page) } : page) });
  let folio = 1;
  const wrap = (frame: Frame, name: string, content: ReactNode, extra: string, hasPhoto = false, columns?: 1 | 2, strip: ReturnType<typeof stripPhotos> = []) => {
    const pageNumber = folio++;
    const isActive = active.id === frame.id && active.index === frame.index;
    const frameKey = `${frame.id}-${frame.index}`;
    const frameBlocks = layout.find(p => p.page.id === frame.id)?.frames[frame.index] ?? [];
    const passages = changes ? reportFields(report).filter(({ key }) => frame.id === "cover" || frame.id === "back" ? key.startsWith(`${frame.id}.`) : key.startsWith(`page:${frame.id}:`)).flatMap(({ key, label, text }) => {
      const before = changes.baseline[key] ?? (changes.since === "round" ? "" : text);
      const latest = changes.edits.find(entry => entry.fields.some(field => field.key === key));
      return changePassages(key, label, before, text).filter(p => p.start === undefined ? frame.index === 0 : frameBlocks.length ? frameBlocks.some(b => p.end === p.start ? p.start! >= b.start && p.start! <= b.start + b.text.length : b.start < p.end! && b.start + b.text.length > p.start!) : frame.index === 0).map(p => ({ ...p, author: latest?.author, at: latest?.at }));
    }) : [];
    const portraits = strip[0]?.[0].startsWith("portrait-");
    const hasWorkshopPhotos = strip.some(([key]) => key.startsWith("workshop-"));
    const swapLabel = portraits ? "Swap portrait" : hasWorkshopPhotos
      ? frame.id === "venturelift" ? "Swap venture photo" : "Swap workshop photo"
      : "Swap additional photo";
    return (
      <div key={`${frame.id}:${frame.index}`} id={`report-frame-${frame.id}-${frame.index}`}
        className={styles.sheet} style={{ width: 816 * scale }}>
        <div className={`${styles.sheetBar} report-screen-only`}>
          <button type="button" aria-pressed={isActive} onClick={() => onSelect(frame)}>
            {folioText(pageNumber)} / {folioText(num)} · {name}
          </button>
          <div>
            {onPhoto && frame.id !== "back" && (hasPhoto || !hasWorkshopPhotos) && <button type="button" onClick={() => onPhoto(frame)}>{portraits ? "Swap wide photo" : hasPhoto ? "Swap photo" : "Add photo"}</button>}
            {onPhoto && strip.length > 0 && (
              <select aria-label={swapLabel} value="" onChange={(event) => onPhoto(frame, event.target.value)}>
                <option value="" disabled>{swapLabel}…</option>
                {strip.map(([key, photo]) => <option key={key} value={key}>{photoLabel(photo)}</option>)}
              </select>
            )}
          </div>
        </div>
        {reviewTools && <aside className={`${styles.pageMargin} report-screen-only`} aria-label={`Page ${pageNumber} review notes`}>
          <div data-report-page-notes={frameKey} />
          {passages.length > 0 && <div className={styles.changeBubble}>
            <button type="button" aria-haspopup="dialog" aria-controls={`report-frame-${frame.id}-${frame.index}-changes`} aria-expanded={openChanges === frameKey} onClick={() => setOpenChanges(openChanges === frameKey ? null : frameKey)}>Text changes · {passages.length}</button>
          </div>}
          {openChanges === frameKey && passages.length > 0 && <ReportChangePopup frameId={`report-frame-${frame.id}-${frame.index}`} pageNumber={pageNumber} passages={passages} track={trackChanges} onTrack={onTrackChanges} onClose={() => setOpenChanges(null)} />}

        </aside>}
        <article className={`${styles.paper} ${extra}`} style={{ zoom: scale }} aria-label={`Page ${pageNumber} of ${num} · ${name}`}
          onFocus={(event) => { if (!isActive && event.target.isContentEditable) onSelect(frame); }}
          onClick={onPhoto && ((event) => {
            // Click a photo to swap, crop, zoom, rotate, flip or recaption it.
            const target = event.target as HTMLElement;
            const slot = target.closest<HTMLElement>("[data-photo-slot]")?.dataset.photoSlot;
            if (slot !== undefined && !target.isContentEditable && !target.closest("figcaption")) onPhoto(frame, slot || undefined); // captions are for comments
          })}
          data-print-page="" data-markup={markup ? "true" : undefined} data-section={frame.id} data-audience={String(!!layout.find(x => x.page.id === frame.id)?.page.registration?.audience)} data-review-draft={!ready} data-columns={columns} data-continued={frame.index > 0 ? "true" : undefined}
          data-portraits={portraits ? "true" : undefined} data-photo-strip={strip.length ? "true" : undefined}>
          {!ready && <span className={styles.draft}>Review draft</span>}
          {content}
        </article>
        {isActive && edit}
      </div>
    );
  };

  return (
    <div className={styles.stage} ref={stage} data-report-paper="" data-review-tools={reviewTools || undefined} data-photo-editable={onPhoto ? "" : undefined}>
      {wrap({ id: "cover", index: 0 }, "Cover", <>
        <CoverArt photo={report.cover.photo ?? recommendations.cover?.[0] ?? photoPreset("cover.jpg")} />
        {/* eslint-disable-next-line @next/next/no-img-element -- original print artwork */}
        <img className={styles.logo} src={`${REPORT_ASSETS}/biohubnet-logo-white.png`} alt="BioHubNet" />
        <div className={styles.coverText}>
          <p className={styles.kicker}>2026 Event Report</p>
          <h1 data-report-field="cover.title" {...inline(report.cover.title, "Cover title", (title) => onTextChange?.({ ...report, cover: { ...report.cover, title } }))}>{show("cover.title", report.cover.title)}</h1>
          <p data-report-field="cover.theme" className={styles.coverTheme} {...inline(report.cover.theme, "Cover theme", (theme) => onTextChange?.({ ...report, cover: { ...report.cover, theme } }))}>{show("cover.theme", report.cover.theme)}</p>
          <p data-report-field="cover.date" className={styles.coverDate} {...inline(report.cover.date, "Cover date", (date) => onTextChange?.({ ...report, cover: { ...report.cover, date } }))}>{show("cover.date", report.cover.date)}</p>
        </div>
      </>, styles.cover, true)}
      {layout.map(({ page, columns, frames, photoHeights, hasWorkshops, workshopHeights }, section) => { const pageMarks = tracked(page, frames); return frames.map((blocks, index) => {
        const strip = stripPhotos(page, index);
        const choices = [...strip, ...blocks.flatMap((block) => workshopPhotos(page, block.photoRow))];
        const photoGrid = hasTrainingPhotoGrid(page, index);
        const paired = hasPairedPhotos(page, index);
        const stripHeight = photoGrid ? TRAINING_TILE_PREVIEW_HEIGHT : portraitHeight(strip.length);
        return wrap({ id: page.id, index }, index === 0 ? page.title : `${page.title} · continued`, <>
          {index === 0
            ? <header className={styles.chapterHead}>
              <span><span>{folioText(section + 1)} / <span data-report-field={`page:${page.id}:label`} {...inline(page.label, "Section label", (label) => patchPage(page.id, () => ({ label })))}>{show(`page:${page.id}:label`, page.label)}</span></span></span>
              <h2 data-report-field={`page:${page.id}:title`} {...inline(page.title, "Section title", (title) => patchPage(page.id, () => ({ title })))}>{show(`page:${page.id}:title`, page.title)}</h2>
              {page.intro && <p data-report-field={`page:${page.id}:intro`} className={styles.pageIntro} {...inline(page.intro, "Section introduction", (intro) => patchPage(page.id, () => ({ intro })), true)}>{show(`page:${page.id}:intro`, page.intro)}</p>}
            </header>
            : <header className={styles.continuationHead}>{folioText(section + 1)} / {show(`page:${page.id}:title`, page.title)} <span> / continued</span></header>}
          {index === 0 && page.image === "registration" && page.registration && <RegistrationChart chart={page.registration} showSource={!ready}
            inline={inline} change={(registration) => patchPage(page.id, () => ({ registration }))} />}
          {hasLeadPhoto(page, index) && (paired
            ? <div className={styles.leadPhotos}>
              <PhotoFigure slot="" photo={pagePhoto(page, index, recommendations)} caption={page.showCaptions !== false} height={photoHeights[index]} />
              <PhotoFigure slot={strip[0][0]} photo={strip[0][1]} caption={page.showCaptions !== false} height={photoHeights[index]} />
            </div>
            : <PhotoFigure slot="" photo={pagePhoto(page, index, recommendations)} caption={page.showCaptions !== false} height={photoHeights[index]} lead />)}
          <div className={styles.copy}>
            <div className={`${styles.story}${hasWorkshops ? ` ${styles.workshopStory}` : ""}`}>
              <Blocks page={page} blocks={blocks} inline={inline} tracked={pageMarks} heights={workshopHeights?.[index]}
                change={(block, text) => patchPage(page.id, (current) => ({ text: replaceReportBlock(current.text, block, text) }))} />
              {onTextChange && index === 0 && !page.text.trim() && page.image !== "registration" && photoHeights[index] === 0 &&
                <p className={`${styles.paragraph} ${styles.emptyStory}`} {...inline("", "Story text", (text) => patchPage(page.id, () => ({ text })), true)} />}
            </div>
            {!photoGrid && !hasLeadPhoto(page, index) && photoHeights[index] > 0 && <PhotoFigure slot="" photo={pagePhoto(page, index, recommendations)} caption={page.showCaptions !== false} height={photoHeights[index]} />}
            {strip.length > 0 && !paired && <div className={`${styles.portraitStrip}${photoGrid ? ` ${styles.trainingPhotoGrid}` : ""}`}
              role="group" aria-label={photoGrid ? page.id === "pitch-competition" ? "Innovation Ignited photographs" : "Training Week photographs" : "Additional photographs"}>
              {photoGrid && <PhotoFigure slot="" photo={pagePhoto(page, index, recommendations)} caption={page.showCaptions !== false} height={stripHeight} />}
              {strip.map(([key, photo]) => <PhotoFigure key={key} slot={key} photo={photo} caption={page.showCaptions !== false} height={stripHeight} />)}
            </div>}
          </div>
          <footer className={styles.folio}><span>2026 Event Report</span><span>{folioText(folio)}</span></footer>
        </>, styles.chapter, photoHeights[index] > 0, columns, choices);
      }); })}
      {wrap({ id: "back", index: 0 }, "Back cover", <>
        {/* eslint-disable-next-line @next/next/no-img-element -- original print artwork */}
        <img className={styles.logo} src={`${REPORT_ASSETS}/biohubnet-logo-white.png`} alt="BioHubNet" />
        <div className={styles.backText}>
          <h2 data-report-field="back.title" {...inline(report.back.title, "Back cover title", (title) => onTextChange?.({ ...report, back: { ...report.back, title } }))}>{show("back.title", report.back.title)}</h2>
          <p data-report-field="back.text" {...inline(report.back.text, "Back cover text", (text) => onTextChange?.({ ...report, back: { ...report.back, text } }), true)}>{show("back.text", report.back.text)}</p>
          <div className={styles.backLinks}>
            <a href="https://biohubnet.ca">biohubnet.ca</a>
            <a href="https://www.linkedin.com/company/biohubnet/" className={styles.backQr}>
              {/* eslint-disable-next-line @next/next/no-img-element -- vector QR for print */}
              <img src="/symposium-report-linkedin.svg" width={116} height={116} alt="" />
              <span><svg className={styles.linkedinLogo} aria-label="LinkedIn" role="img" width="22" height="22" viewBox="0 0 24 24"><rect width="24" height="24" rx="3" fill="#0A66C2" /><path fill="#fff" d="M5 9h3v10H5zM6.5 4a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5M10 9h2.8v1.4c.5-.9 1.5-1.6 3-1.6 3 0 3.7 2 3.7 4.6V19h-3v-5c0-1.4 0-2.7-1.8-2.7S13 12.7 13 14V19h-3z" /></svg>Scan for BioHubNet on LinkedIn</span>
            </a>
          </div>
        </div>
      </>, styles.back)}
    </div>
  );
}
