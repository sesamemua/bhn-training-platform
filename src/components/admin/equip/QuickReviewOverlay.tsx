"use client";

/**
 * Open an application over the queue instead of navigating to it.
 *
 * The queue is a working list — a reviewer goes down it. Following a
 * link to the detail page and pressing back loses the scroll position
 * and the filter tab every single time, which is why triage happens in
 * an overlay here and the full page stays exactly where it was for
 * everything else (decisions, the ledger, the applicant thread).
 *
 * Data is fetched when it opens rather than passed down: the queue
 * renders up to 100 rows, and loading every application's documents and
 * notes to prepare overlays nobody may open would be the expensive way
 * round.
 */
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, X, Loader2, ExternalLink, AlertCircle } from "lucide-react";
import { DocumentAnnotator, type AnnotatableDocument, type DocumentNote } from "./DocumentAnnotator";
import { TriageSummary } from "./TriageSummary";

interface LoadedApplication {
  documents: AnnotatableDocument[];
  notes: DocumentNote[];
  applicantName: string;
  status: string;
}

export function QuickReviewOverlay({
  applicationId,
  applicantName,
}: {
  applicationId: string;
  applicantName: string;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<LoadedApplication | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [appRes, notesRes] = await Promise.all([
        fetch(`/api/admin/equip/applications/${applicationId}`),
        fetch(`/api/admin/equip/applications/${applicationId}/notes`),
      ]);
      if (!appRes.ok) throw new Error(`Couldn't load the application (HTTP ${appRes.status}).`);
      const appJson = (await appRes.json()) as {
        application?: { documents?: unknown; status?: string };
      };
      const notesJson = notesRes.ok
        ? ((await notesRes.json()) as { notes?: DocumentNote[] })
        : { notes: [] };

      setData({
        documents: (appJson.application?.documents as AnnotatableDocument[]) ?? [],
        notes: notesJson.notes ?? [],
        applicantName,
        status: appJson.application?.status ?? "",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load that application.");
    } finally {
      setLoading(false);
    }
  }, [applicationId, applicantName]);

  function openOverlay() {
    setOpen(true);
    if (!data) void load();
  }

  // Escape closes it, and the page behind must not scroll while it's up.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={openOverlay}
        className="inline-flex items-center gap-0.5 whitespace-nowrap text-xs font-bold text-brand-700 hover:text-brand-800"
      >
        Review <ArrowRight size={11} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4 sm:p-8"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full max-w-6xl rounded-2xl border border-line bg-card-solid shadow-elevated">
            <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">Reviewing</p>
                <h2 className="truncate text-sm font-extrabold text-fg">{applicantName}</h2>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a
                  href={`/admin/equip/${applicationId}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-line bg-card-solid px-2.5 py-1.5 text-[11.5px] font-semibold text-fg hover:bg-elevated"
                >
                  <ExternalLink size={12} /> Full page
                </a>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md p-1.5 text-muted hover:bg-elevated hover:text-fg"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>
            </header>

            <div className="space-y-4 p-4">
              {loading && (
                <p className="flex items-center justify-center gap-2 py-10 text-[12.5px] text-muted">
                  <Loader2 size={15} className="animate-spin" /> Loading the application…
                </p>
              )}

              {error && (
                <p className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2 text-[12px] font-medium text-rose-800">
                  <AlertCircle size={13} /> {error}
                </p>
              )}

              {data && !loading && (
                <>
                  <TriageSummary applicationId={applicationId} />
                  <DocumentAnnotator
                    applicationId={applicationId}
                    documents={data.documents}
                    initialNotes={data.notes}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
