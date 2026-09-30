"use client";
import { useEffect, useRef, useState } from "react";
import { Send, MessageSquare } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface Msg {
  id: string;
  pairId: string;
  senderId: string;
  body: string;
  createdAt: string | Date;
}

export function BuddyChat({ pairId, mePartnerName, myUserId }: { pairId: string; mePartnerName: string; myUserId: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function load() {
    const res = await fetch(`/api/buddy/${pairId}/messages`);
    if (res.ok) {
      const data = (await res.json()) as Msg[];
      setMessages(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // Light polling — every 15s while page is visible
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/buddy/${pairId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Send failed");
        return;
      }
      const created = (await res.json()) as Msg;
      setMessages((cur) => [...cur, created]);
      setText("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden flex flex-col" style={{ minHeight: 360 }}>
      <div className="px-5 py-3 border-b border-line flex items-center gap-2">
        <MessageSquare size={16} className="text-brand-600" />
        <h3 className="font-semibold text-fg">Notes between you and {mePartnerName}</h3>
        <span className="text-xs text-subtle ml-auto">Async — like email, not a chat</span>
      </div>

      <div className="flex-1 overflow-y-auto p-5 bg-elevated/30 space-y-3 min-h-[220px] max-h-[480px]">
        {loading && <p className="text-xs text-subtle text-center">Loading…</p>}
        {!loading && messages.length === 0 && (
          <p className="text-sm text-subtle text-center py-12">
            No notes yet. Send the first one to kick things off.
          </p>
        )}
        {messages.map((m) => {
          const mine = m.senderId === myUserId;
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-line",
                  mine
                    ? "bg-brand-600 text-white rounded-br-sm"
                    : "bg-card border border-line text-fg rounded-bl-sm"
                )}
              >
                {m.body}
                <p className={cn("text-[10px] mt-1", mine ? "text-brand-100" : "text-subtle")}>
                  {new Date(m.createdAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-line p-3 bg-card">
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder="Write a note… (⌘/Ctrl+Enter to send)"
            className="flex-1 bg-card border border-line rounded-lg px-3 py-2 text-sm text-fg placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 resize-none"
          />
          <Button onClick={send} loading={busy} disabled={!text.trim()}>
            <Send size={13} /> Send
          </Button>
        </div>
        {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
      </div>
    </Card>
  );
}
