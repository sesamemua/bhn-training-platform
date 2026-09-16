"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Bell, X, Check, BellRing, Users, Eye, Activity, AtSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { isPausedPath } from "@/lib/deploy/paused";

interface NotifItem {
  id: string;
  reason: string;
  readAt: string | null;
  createdAt: string;
  text: string;
  postingId: string | null;
  unread: boolean;
}

export function NotificationBell({ initialUnreadCount }: { initialUnreadCount: number }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnreadCount);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative p-2 rounded-lg hover:bg-elevated text-muted hover:text-fg transition-colors"
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
      >
        {unread > 0 ? <BellRing size={18} /> : <Bell size={18} />}
        {unread > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-rose-600 text-white text-[9px] font-bold flex items-center justify-center leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <NotificationInboxDrawer
          onClose={() => setOpen(false)}
          onUnreadChange={setUnread}
        />
      )}
    </>
  );
}

function NotificationInboxDrawer({
  onClose,
  onUnreadChange,
}: {
  onClose: () => void;
  onUnreadChange: (n: number) => void;
}) {
  const [items, setItems] = useState<NotifItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/notifications?limit=40");
      const j = await r.json();
      setItems(j.notifications ?? []);
      onUnreadChange(j.unreadCount ?? 0);
    } finally {
      setLoading(false);
    }
  }, [onUnreadChange]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markAll() {
    await fetch("/api/notifications/read-all", { method: "POST" });
    setItems((cur) => cur.map((n) => ({ ...n, unread: false, readAt: new Date().toISOString() })));
    onUnreadChange(0);
  }

  async function markOne(id: string, postingId: string | null) {
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
    setItems((cur) =>
      cur.map((n) =>
        n.id === id ? { ...n, unread: false, readAt: new Date().toISOString() } : n,
      ),
    );
    // Every notification is employer activity; with the employer portal
    // paused on this deployment there is nowhere to send the reader.
    if (postingId && !isPausedPath("/employer/postings")) {
      window.location.href = `/employer/postings#posting-${postingId}`;
    }
  }

  // Group by day
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  function dayLabel(iso: string) {
    const d = new Date(iso).toDateString();
    if (d === today) return "Today";
    if (d === yesterday) return "Yesterday";
    return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
  }

  const groups: Record<string, NotifItem[]> = {};
  for (const item of items) {
    const label = dayLabel(item.createdAt);
    (groups[label] ??= []).push(item);
  }

  function reasonIcon(reason: string) {
    const cls = "shrink-0 mt-0.5";
    switch (reason) {
      case "mention":
        return <AtSign size={14} className={cn(cls, "text-violet-600")} />;
      case "hiring_team":
        return <Users size={14} className={cn(cls, "text-brand-600")} />;
      case "owner_oversight":
        return <Eye size={14} className={cn(cls, "text-amber-600")} />;
      default:
        return <Activity size={14} className={cn(cls, "text-muted")} />;
    }
  }

  // Portal to <body>: the sidebar <aside> that mounts this bell always carries a
  // `transform` (translate-x for its slide-in), which makes it the containing block
  // for position:fixed descendants — so without a portal this drawer anchors to the
  // 256px sidebar and gets pushed off-screen left (clipping the text). Rendering into
  // <body> restores viewport-relative fixed positioning.
  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[90] bg-black/30" onClick={onClose} />
      {/* Drawer */}
      <div className="fixed top-0 right-0 bottom-0 z-[100] w-full sm:w-[380px] bg-card border-l border-line shadow-2xl flex flex-col">
        <header className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
          <h2 className="text-base font-bold text-fg">Notifications</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={markAll}
              className="text-xs text-brand-700 hover:underline font-semibold"
            >
              Mark all read
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-elevated text-muted hover:text-fg"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto py-2">
          {loading && (
            <div className="space-y-2 p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 rounded-xl bg-elevated animate-pulse" />
              ))}
            </div>
          )}
          {!loading && items.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-muted">
              <Check size={24} className="mb-2 text-emerald-600" />
              <p className="text-sm font-medium">You&apos;re all caught up</p>
            </div>
          )}
          {!loading &&
            Object.entries(groups).map(([label, group]) => (
              <div key={label}>
                <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-subtle px-5 py-2">
                  {label}
                </p>
                {group.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => markOne(n.id, n.postingId)}
                    className={cn(
                      "w-full text-left flex items-start gap-3 px-5 py-3 hover:bg-elevated transition-colors",
                      n.unread && "bg-brand-50/40 border-l-2 border-brand-400",
                    )}
                  >
                    {reasonIcon(n.reason)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-fg leading-snug line-clamp-2">{n.text}</p>
                      <p className="text-[10px] text-muted mt-0.5">
                        {new Date(n.createdAt).toLocaleTimeString("en-CA", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    {n.unread && (
                      <span className="w-2 h-2 rounded-full bg-brand-500 mt-1.5 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            ))}
        </div>
      </div>
    </>,
    document.body,
  );
}
