"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Registration, Report, ReportPage } from "@/lib/symposium-report/document";
import { paginate, reportBlocks, type Block } from "@/lib/symposium-report/paginate";
import styles from "./report.module.css";

const ASSETS = "/api/workspace/symposium-2026/report/assets";
const photos = {
  microbix: "Training Week participants visit the Microbix facility.",
  keynote: "Christopher Procyshyn delivers the symposium keynote.",
  venture: "A presenter on stage during the EQUIP VentureLift showcase.",
  roundtable: "Symposium attendees take part in a table discussion.",
  network: "Attendees in conversation at the Annual Symposium.",
};

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

function Figure({ image, registration }: Pick<ReportPage, "image" | "registration">) {
  if (!image) return null;
  if (image === "registration") return registration ? <RegistrationChart chart={registration} /> : null;
  return (
    <figure className={styles.photo}>
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed Letter crop, same source for print */}
      <img src={`${ASSETS}/${image}.jpg`} alt={photos[image]} />
      <figcaption>{photos[image]}</figcaption>
    </figure>
  );
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return blocks.map((block, index) => {
    const Tag = block.kind === "heading" && !block.continued ? "h3" : "p";
    return <Tag className={styles[block.kind]} key={index}>{block.text}</Tag>;
  });
}

export type LaidOutReport = { page: ReportPage; frames: Block[][] }[];

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
    const result = report.pages.map((page) => {
      title.textContent = page.title;
      continuation.firstChild!.textContent = page.title;
      label.textContent = page.label;
      pageNode.dataset.figure = page.image === "registration" ? page.registration ? "chart" : "none" : page.image ? "photo" : "none";
      const blocks = reportBlocks(page.text);
      const frames = paginate(blocks, page.frames, (candidate, index) => {
        pageNode.dataset.continued = String(index > 0);
        measure.replaceChildren(...candidate.map((block) => {
          const node = document.createElement(block.kind === "heading" && !block.continued ? "h3" : "p");
          node.className = styles[block.kind];
          node.textContent = block.text;
          return node;
        }));
        return measure.scrollHeight <= measure.clientHeight;
      });
      return { page, frames };
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
        <div className={styles.copy} data-measure-copy="" />
        <div className={styles.folio} />
      </div>
    </div>
  );
}

export type Frame = { id: string; index: number };

export function ReportPaper({ report, layout, active, ready, onSelect, edit, onEdit, onComment }: {
  report: Report;
  layout: LaidOutReport;
  active: Frame;
  ready: boolean;
  onSelect: (frame: Frame) => void;
  edit: ReactNode;
  onEdit?: (frame: Frame) => void;
  onComment?: (frame: Frame) => void;
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
  const wrap = (frame: Frame, name: string, content: ReactNode, extra: string) => {
    const pageNumber = folio++;
    const isActive = active.id === frame.id && active.index === frame.index;
    return (
      <div key={`${frame.id}:${frame.index}`} id={`report-frame-${frame.id}-${frame.index}`}
        className={styles.sheet} style={{ width: 816 * scale }}>
        <article className={`${styles.paper} ${extra}`} style={{ zoom: scale }} aria-label={`Page ${pageNumber} of ${num} · ${name}`} data-print-page="">
          {!ready && <span className={styles.draft}>Review draft</span>}
          {content}
        </article>
        {isActive && edit}
        <div className={`${styles.sheetBar} report-screen-only`}>
          <button type="button" aria-pressed={isActive} onClick={() => onSelect(frame)}>
            {String(pageNumber).padStart(2, "0")} / {String(num).padStart(2, "0")} · {name}
          </button>
          <div>
            {onEdit && <button type="button" onClick={() => onEdit(frame)}>Edit on page</button>}
            {onComment && <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onComment(frame)}>Comment</button>}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={styles.stage} ref={stage} data-report-paper="">
      {wrap({ id: "cover", index: 0 }, "Cover", <>
        {/* eslint-disable-next-line @next/next/no-img-element -- original print artwork */}
        <img className={styles.logo} src={`${ASSETS}/biohubnet-logo-white.png`} alt="BioHubNet" />
        <div className={styles.coverText}>
          <p className={styles.kicker}>2026 Event Report</p>
          <h1>{report.cover.title}</h1>
          <p className={styles.coverTheme}>{report.cover.theme}</p>
          <p className={styles.coverDate}>{report.cover.date}</p>
        </div>
      </>, styles.cover)}
      {layout.map(({ page, frames }) => frames.map((blocks, index) =>
        wrap({ id: page.id, index }, index === 0 ? page.title : `${page.title} · continued`, <>
          {index === 0
            ? <header className={styles.chapterHead}><span>{page.label}</span><h2>{page.title}</h2></header>
            : <header className={styles.continuationHead}>{page.title} <span> / continued</span></header>}
          {index === 0 && <Figure image={page.image} registration={page.registration} />}
          <div className={styles.copy}>
            {blocks.length ? <Blocks blocks={blocks} /> : <p className={`${styles.emptyFrame} report-screen-only`}>Linked text will flow here as this section grows.</p>}
          </div>
          <footer className={styles.folio}><span>BioHubNet · 2026 Event Report</span><span>{String(folio).padStart(2, "0")}</span></footer>
        </>, styles.chapter),
      ))}
      {wrap({ id: "back", index: 0 }, "Back cover", <>
        {/* eslint-disable-next-line @next/next/no-img-element -- original print artwork */}
        <img className={styles.logo} src={`${ASSETS}/biohubnet-logo-white.png`} alt="BioHubNet" />
        <div className={styles.backText}>
          <p className={styles.kicker}>The network</p>
          <h2>{report.back.title}</h2>
          <p>{report.back.text}</p>
          <a href="https://biohubnet.ca">biohubnet.ca</a>
        </div>
      </>, styles.back)}
    </div>
  );
}
