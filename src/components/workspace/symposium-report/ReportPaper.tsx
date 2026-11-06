"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Registration, Report, ReportPage, ReportPhoto } from "@/lib/symposium-report/document";
import { paginate, reportBlocks, type Block } from "@/lib/symposium-report/paginate";
import { hasLeadPhoto, hasTrainingPhotoGrid, MIN_FILL_PHOTO, pagePhoto, photoLabel, PHOTO_CAPTION_SPACE, PHOTO_GAP, photoPreset, portraitHeight, portraitPhotos, PORTRAIT_STRIP_SPACE, REPORT_ASSETS, stripPhotos, TRAINING_PHOTO_GRID_SPACE, TRAINING_TILE_PREVIEW_HEIGHT } from "@/lib/symposium-report/photos";
import { CoverArt, PhotoFigure } from "./ReportPhoto";
import styles from "./report.module.css";

const sectorColors = [
  "var(--report-sector-academic)", "var(--report-sector-industry)", "var(--report-sector-other)", "var(--report-sector-public)",
];

function RegistrationChart({ chart }: { chart: Registration }) {
  const total = chart.categories.reduce((sum, item) => sum + item.count, 0);
  return (
    <figure className={styles.registration}>
      <figcaption>Primary organizational affiliation <span>{total.toLocaleString("en-CA")} {chart.unit}</span></figcaption>
      <div className={styles.chartRow}>
        <svg width="146" height="146" viewBox="0 0 42 42" aria-hidden="true">
          {chart.categories.map(({ count }, index) => {
            const share = count / total * 100;
            const offset = chart.categories.slice(0, index).reduce((sum, sector) => sum + sector.count / total * 100, 0);
            return <circle key={index} cx="21" cy="21" r="15.9154943" fill="none" stroke={sectorColors[index]} strokeWidth="8"
              pathLength="100" strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={-offset} transform="rotate(-90 21 21)" />;
          })}
          <text x="21" y="23" textAnchor="middle" className={styles.chartTotal}>{total}</text>
        </svg>
        <dl className={styles.chartLegend}>
          {chart.categories.map(({ count, label }, index) => (
            <div key={index}>
              <dt><i style={{ background: sectorColors[index] }} />{label}</dt>
              <dd>{count} · {(count / total * 100).toFixed(1)}%</dd>
            </div>
          ))}
        </dl>
      </div>
      <p>{chart.source}</p>
    </figure>
  );
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return blocks.map((block, index) => {
    const Tag = block.kind === "heading" && !block.continued ? "h3" : "p";
    return <Tag className={styles[block.kind]} key={index}>{block.text}</Tag>;
  });
}

const folioText = (number: number) => String(number).padStart(2, "0");

export type LaidOutReport = { page: ReportPage; columns: 1 | 2; frames: Block[][]; photoHeights: number[] }[];

export function useReportLayout(report: Report) {
  const ruler = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{ report: Report; pages: LaidOutReport } | null>(null);
  useLayoutEffect(() => {
    const host = ruler.current;
    if (!host) return;
    const pageNode = host.firstElementChild as HTMLElement;
    const intro = pageNode.querySelector<HTMLElement>("[data-measure-intro]")!;
    const title = intro.querySelector("h2")!;
    const label = intro.querySelector("span")!;
    const continuation = pageNode.querySelector<HTMLElement>("[data-measure-continuation]")!;
    const measure = pageNode.querySelector<HTMLElement>("[data-measure-copy]")!;
    const story = measure.firstElementChild as HTMLElement;
    const measureText = (blocks: Block[], index: number, hasStrip: boolean) => {
      pageNode.dataset.continued = String(index > 0);
      pageNode.dataset.photoStrip = String(hasStrip);
      story.replaceChildren(...blocks.map((block) => {
        const node = document.createElement(block.kind === "heading" && !block.continued ? "h3" : "p");
        node.className = styles[block.kind];
        node.textContent = block.text;
        return node;
      }));
      return measure.clientHeight - Math.ceil(story.getBoundingClientRect().height);
    };
    const result = report.pages.map((page, index) => {
      const columns: 1 | 2 = page.text.length >= 900 ? 2 : 1;
      pageNode.dataset.columns = String(columns);
      title.textContent = page.title;
      continuation.firstChild!.textContent = `${folioText(index + 1)} / ${page.title}`;
      label.textContent = `${folioText(index + 1)} / ${page.label}`;
      pageNode.dataset.figure = page.image === "registration" && page.registration ? "chart" : hasLeadPhoto(page, 0) ? "photo" : "none";
      const stripSpace = (index: number) => {
        if (hasTrainingPhotoGrid(page, index)) return TRAINING_PHOTO_GRID_SPACE;
        return stripPhotos(page, index).length ? PORTRAIT_STRIP_SPACE : 0;
      };
      const hasPortraits = portraitPhotos(page).length > 0;
      pageNode.dataset.portraits = String(hasPortraits);
      const frames = paginate(reportBlocks(page.text), page.frames, (candidate, index) => {
        const reserve = !hasLeadPhoto(page, index) && !hasTrainingPhotoGrid(page, index) && page.photos?.[String(index)]
          ? MIN_FILL_PHOTO + PHOTO_CAPTION_SPACE + PHOTO_GAP : 0;
        const strip = stripSpace(index);
        return measureText(candidate, index, strip > 0) >= reserve + strip;
      });
      const photoHeights = frames.map((blocks, index) => {
        if (hasTrainingPhotoGrid(page, index)) return TRAINING_TILE_PREVIEW_HEIGHT;
        const strip = stripSpace(index);
        const freeSpace = measureText(blocks, index, strip > 0) - strip;
        if (hasLeadPhoto(page, index)) {
          const minimum = strip && !hasPortraits ? 146 : 174;
          return minimum + Math.max(0, freeSpace - 3);
        }
        if (strip && !page.photos?.[String(index)]) return 0;
        const space = freeSpace - PHOTO_CAPTION_SPACE - PHOTO_GAP;
        return space >= MIN_FILL_PHOTO ? space : 0;
      });
      return { page, columns, frames, photoHeights };
    });
    // Pagination uses the browser's actual font and frame measurements.
    setLayout({ report, pages: result });
  }, [report]);
  return { layout: layout?.report === report ? layout.pages : null, ruler };
}

export function ReportRuler({ ruler }: { ruler: React.Ref<HTMLDivElement> }) {
  return (
    <div className={styles.ruler} ref={ruler} aria-hidden="true">
      <div className={`${styles.paper} ${styles.chapter}`}>
        <header className={styles.chapterHead} data-measure-intro=""><span /><h2 /></header>
        <div className={styles.continuationHead} data-measure-continuation="">Title <span> / continued</span></div>
        <div className={styles.figureSpacer} />
        <div className={styles.copy} data-measure-copy=""><div className={styles.story} /></div>
        <div className={styles.folio} />
      </div>
    </div>
  );
}

export type Frame = { id: string; index: number };

export function ReportPaper({ report, layout, active, ready, onSelect, edit, onEdit, onComment, onPhoto, recommendations }: {
  report: Report;
  recommendations: Record<string, ReportPhoto[]>;
  layout: LaidOutReport;
  active: Frame;
  ready: boolean;
  onSelect: (frame: Frame) => void;
  edit: ReactNode;
  onEdit?: (frame: Frame) => void;
  onComment?: (frame: Frame) => void;
  onPhoto?: (frame: Frame, slot?: string) => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setScale(Math.min(1, Math.max(0.2, entry.contentRect.width / 816))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const num = 2 + layout.reduce((sum, { frames }) => sum + frames.length, 0);
  let folio = 1;
  const wrap = (frame: Frame, name: string, content: ReactNode, extra: string, hasPhoto = false, columns?: 1 | 2, strip: ReturnType<typeof stripPhotos> = []) => {
    const pageNumber = folio++;
    const isActive = active.id === frame.id && active.index === frame.index;
    const portraits = strip[0]?.[0].startsWith("portrait-");
    const swapLabel = portraits ? "Swap portrait" : "Swap additional photo";
    return (
      <div key={`${frame.id}:${frame.index}`} id={`report-frame-${frame.id}-${frame.index}`}
        className={styles.sheet} style={{ width: 816 * scale }}>
        <div className={`${styles.sheetBar} report-screen-only`}>
          <button type="button" aria-pressed={isActive} onClick={() => onSelect(frame)}>
            {folioText(pageNumber)} / {folioText(num)} · {name}
          </button>
          <div>
            {onEdit && <button type="button" onClick={() => onEdit(frame)}>Edit on page</button>}
            {onPhoto && frame.id !== "back" && <button type="button" onClick={() => onPhoto(frame)}>{portraits ? "Swap wide photo" : hasPhoto ? "Swap photo" : "Add photo"}</button>}
            {onPhoto && strip.length > 0 && (
              <select aria-label={swapLabel} value="" onChange={(event) => onPhoto(frame, event.target.value)}>
                <option value="" disabled>{swapLabel}…</option>
                {strip.map(([key, photo]) => <option key={key} value={key}>{photoLabel(photo)}</option>)}
              </select>
            )}
            {onComment && <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onComment(frame)}>Comment</button>}
          </div>
        </div>
        <article className={`${styles.paper} ${extra}`} style={{ zoom: scale }} aria-label={`Page ${pageNumber} of ${num} · ${name}`}
          data-print-page="" data-columns={columns} data-continued={frame.index > 0 ? "true" : undefined}
          data-portraits={portraits ? "true" : undefined} data-photo-strip={strip.length ? "true" : undefined}>
          {!ready && <span className={styles.draft}>Review draft</span>}
          {content}
        </article>
        {isActive && edit}
      </div>
    );
  };

  return (
    <div className={styles.stage} ref={stage} data-report-paper="">
      {wrap({ id: "cover", index: 0 }, "Cover", <>
        <CoverArt photo={report.cover.photo ?? recommendations.cover?.[0] ?? photoPreset("cover.jpg")} />
        {/* eslint-disable-next-line @next/next/no-img-element -- original print artwork */}
        <img className={styles.logo} src={`${REPORT_ASSETS}/biohubnet-logo-white.png`} alt="BioHubNet" />
        <div className={styles.coverText}>
          <p className={styles.kicker}>2026 Event Report</p>
          <h1>{report.cover.title}</h1>
          <p className={styles.coverTheme}>{report.cover.theme}</p>
          <p className={styles.coverDate}>{report.cover.date}</p>
        </div>
      </>, styles.cover, true)}
      {layout.map(({ page, columns, frames, photoHeights }, section) => frames.map((blocks, index) => {
        const strip = stripPhotos(page, index);
        const photoGrid = hasTrainingPhotoGrid(page, index);
        const stripHeight = photoGrid ? TRAINING_TILE_PREVIEW_HEIGHT : portraitHeight(strip.length);
        return wrap({ id: page.id, index }, index === 0 ? page.title : `${page.title} · continued`, <>
          {index === 0
            ? <header className={styles.chapterHead}><span>{folioText(section + 1)} / {page.label}</span><h2>{page.title}</h2></header>
            : <header className={styles.continuationHead}>{folioText(section + 1)} / {page.title} <span> / continued</span></header>}
          {index === 0 && page.image === "registration" && page.registration && <RegistrationChart chart={page.registration} />}
          {hasLeadPhoto(page, index) && <PhotoFigure photo={pagePhoto(page, index, recommendations)} height={photoHeights[index]} lead />}
          <div className={styles.copy}>
            <div className={styles.story}><Blocks blocks={blocks} /></div>
            {!photoGrid && !hasLeadPhoto(page, index) && photoHeights[index] > 0 && <PhotoFigure photo={pagePhoto(page, index, recommendations)} height={photoHeights[index]} />}
            {strip.length > 0 && <div className={`${styles.portraitStrip}${photoGrid ? ` ${styles.trainingPhotoGrid}` : ""}`}
              role="group" aria-label={photoGrid ? "Training Week photographs" : "Additional photographs"}>
              {photoGrid && <PhotoFigure photo={pagePhoto(page, index, recommendations)} height={stripHeight} />}
              {strip.map(([key, photo]) => <PhotoFigure key={key} photo={photo} height={stripHeight} />)}
            </div>}
          </div>
          <footer className={styles.folio}><span>BioHubNet / 2026 Event Report</span><span>{folioText(folio)}</span></footer>
        </>, styles.chapter, photoHeights[index] > 0, columns, strip);
      }))}
      {wrap({ id: "back", index: 0 }, "Back cover", <>
        {/* eslint-disable-next-line @next/next/no-img-element -- original print artwork */}
        <img className={styles.logo} src={`${REPORT_ASSETS}/biohubnet-logo-white.png`} alt="BioHubNet" />
        <div className={styles.backText}>
          <h2>{report.back.title}</h2>
          <p>{report.back.text}</p>
          <div className={styles.backLinks}>
            <a href="https://biohubnet.ca">biohubnet.ca</a>
            <a href="https://www.linkedin.com/company/biohubnet/" className={styles.backQr}>
              {/* eslint-disable-next-line @next/next/no-img-element -- vector QR for print */}
              <img src="/symposium-report-linkedin.svg" width={116} height={116} alt="" />
              <span>Follow BioHubNet on LinkedIn</span>
            </a>
          </div>
        </div>
      </>, styles.back)}
    </div>
  );
}
