"use client";

import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, RefreshCw } from "lucide-react";
import { RegistrationCounts } from "./RegistrationCounts";
import { RegistrationSwitch } from "./RegistrationSwitch";
import { MarketingMetrics } from "./MarketingMetrics";
import SpeakerSessionActions from "@/components/admin/events/SpeakerSessionActions";
import { DASHBOARD_CARD_LABELS, DEFAULT_CARD_ORDER, moveDashboardCard, type DashboardCard, type DashboardLayout } from "@/lib/dashboard/card-order";

type Props = Omit<ComponentProps<typeof RegistrationCounts>, "renderCards"> & { releasedSeats: ReactNode; initialLayout: DashboardLayout | null };
const API = "/api/admin/dashboard-layout";
const BUTTON = "grid h-8 w-8 place-items-center rounded-md border border-line bg-card-solid text-fg hover:bg-elevated disabled:opacity-30";

export function AdminDashboardCards({ releasedSeats, initialLayout, ...registrationProps }: Props) {
  const [layout, setLayout] = useState(initialLayout);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const busyRef = useRef(false);
  const generation = useRef(0);
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (busyRef.current || document.hidden) return;
      const started = generation.current;
      try {
        const response = await fetch(API, { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        if (!cancelled && !busyRef.current && started === generation.current) { setLayout(body); setError(""); }
      } catch (e) { if (!cancelled && started === generation.current) setError(e instanceof Error ? e.message : "Couldn't refresh the shared order."); }
    };
    void load();
    const timer = setInterval(() => void load(), 30000);
    window.addEventListener("focus", load);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener("focus", load); };
  }, [retry]);
  async function move(id: DashboardCard, direction: -1 | 1) {
    if (!layout || busyRef.current) return;
    const before = layout;
    const order = moveDashboardCard(layout.order, id, direction);
    busyRef.current = true; generation.current++; setBusy(true); setError(""); setNotice("");
    setLayout({ ...layout, order });
    try {
      const response = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order, version: layout.version }) });
      const body = await response.json();
      if (response.status === 409) {
        setLayout(body.layout); setError("Another admin changed the order. Their latest order is shown; try your move again.");
      } else if (!response.ok) throw new Error(body.error);
      else { setLayout(body.layout); setNotice("Order saved for all admins."); }
    } catch (e) { setLayout(before); setError(e instanceof Error ? e.message : "Couldn't save the order."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  const order = layout?.order ?? DEFAULT_CARD_ORDER;
  return <section aria-label="Admin dashboard cards">
    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
      <p role="status" className="text-xs text-muted">{busy ? "Saving shared order..." : notice || "Shared admin layout"}</p>
      <button type="button" title="Refresh shared card order" aria-label="Refresh shared card order" className={BUTTON} disabled={busy} onClick={() => setRetry((n) => n + 1)}><RefreshCw size={14} /></button>
    </div>
    {error && <p role="alert" className="mb-2 text-sm text-fg">{error}</p>}
    <RegistrationCounts {...registrationProps} renderCards={({ registration, capacity }) => {
      const cards: Record<DashboardCard, ReactNode> = {
        symposium: registration,
        speakers: <SpeakerSessionActions framed onReview={(id, session) => {
          const params = new URLSearchParams({ reviewPerson: id });
          if (session) params.set("reviewSession", session);
          router.push(`/admin/workspace/symposium-2026/speakers?${params}`);
        }} />,
        released: releasedSeats,
        capacity: capacity || <article className="aero-frame"><div className="aero-card"><h3 className="aero-h">Training Week capacity</h3><p className="text-sm text-muted">Capacity is unavailable. Reload the dashboard to retry.</p></div></article>,
        registration: <RegistrationSwitch />,
        marketing: <MarketingMetrics />,
      };
      return order.map((id, index) => <div key={id} data-dashboard-card={id} className="min-w-0">
        <div className="mb-1 flex justify-end gap-1">
          <button type="button" className={BUTTON} aria-label={`Move ${DASHBOARD_CARD_LABELS[id]} up`} title="Move up for all admins" disabled={!layout || busy || index === 0} onClick={() => void move(id, -1)}><ArrowUp size={15} /></button>
          <button type="button" className={BUTTON} aria-label={`Move ${DASHBOARD_CARD_LABELS[id]} down`} title="Move down for all admins" disabled={!layout || busy || index === order.length - 1} onClick={() => void move(id, 1)}><ArrowDown size={15} /></button>
        </div>
        {cards[id]}
      </div>);
    }} />
  </section>;
}
