"use client";

import { useEffect, useState } from "react";
import { REPORT_API, type Report, type ReportPhoto } from "@/lib/symposium-report/document";
import { ReportPaper, ReportRuler, useReportLayout, type Frame } from "./ReportPaper";

export function ReportReviewReader({ report, round, approved, recommendations }: {
  report: Report; round: number; approved: boolean; recommendations: Record<string, ReportPhoto[]>;
}) {
  const [active, setActive] = useState<Frame>({ id: "cover", index: 0 });
  const [error, setError] = useState(false);
  const { layout, ruler } = useReportLayout(report, approved);
  const ready = !!layout;
  useEffect(() => {
    if (!ready) return;
    const script = document.createElement("script");
    script.src = `${REPORT_API}/review?overlay=1`;
    script.dataset.round = String(round);
    script.onerror = () => setError(true);
    document.head.appendChild(script);
    return () => {
      script.remove();
      (window as Window & { __bhnReviewCleanup?: () => void }).__bhnReviewCleanup?.();
    };
  }, [ready, round]);

  return <>
    {error && <p role="alert">The review panel could not load. <button type="button" onClick={() => window.location.reload()} className="underline">Reload the review</button>.</p>}
    {layout && <ReportPaper report={report} layout={layout} active={active} ready={approved} recommendations={recommendations}
      onSelect={setActive} edit={null} onTyping={() => {}}
      onComment={approved ? undefined : (frame) => {
        setActive(frame);
        const sheet = document.getElementById(`report-frame-${frame.id}-${frame.index}`);
        const page = sheet?.querySelector("article");
        if (page) page.dispatchEvent(new CustomEvent("bhn-report-comment", { bubbles: true }));
      }} />}
    <ReportRuler ruler={ruler} />
  </>;
}
