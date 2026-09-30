"use client";

/**
 * Outreach email templates — pick a template, personalise it for a contact
 * (name / org auto-filled, plus your name), then Copy or Open in your email
 * client, and optionally log it as a reach-out. Admins can edit each template
 * (by hand or with AI) — edits persist for the whole team.
 */
import { useMemo, useState } from "react";
import {
  X, Mail, Copy, Check, Pencil, Sparkles, Loader2, RotateCcw, ExternalLink,
  BadgeCheck, UserRound, Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

export interface ResolvedTemplate {
  id: string;
  label: string;
  when: string;
  subject: string;
  body: string;
  isCustomized: boolean;
}
export interface ContactLite { id: string; name: string; org: string; email: string }
export interface PlaceholderDoc { token: string; desc: string }

const firstNameOf = (n: string) => (n.trim().split(/\s+/)[0] || "there");

/** Client-side {{placeholder}} substitution (mirrors the server resolver). */
function personalize(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");
}

export function OutreachTemplatesModal({
  templates: initial,
  placeholders,
  contacts,
  senderName,
  canEdit,
  onClose,
}: {
  templates: ResolvedTemplate[];
  placeholders: PlaceholderDoc[];
  contacts: ContactLite[];
  senderName: string;
  canEdit: boolean;
  onClose: () => void;
}) {
  const [templates, setTemplates] = useState(initial);
  const [selectedId, setSelectedId] = useState(initial[0]?.id ?? "");
  const [contactId, setContactId] = useState("");
  const [editing, setEditing] = useState(false);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [ai, setAi] = useState("");
  const [busy, setBusy] = useState<"save" | "ai" | "reset" | "log" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();

  const tpl = templates.find((t) => t.id === selectedId) ?? templates[0];
  const contact = contacts.find((c) => c.id === contactId) ?? null;

  const vars = useMemo<Record<string, string>>(() => ({
    firstName: contact ? firstNameOf(contact.name) : "{{firstName}}",
    contactName: contact?.name || "{{contactName}}",
    org: contact?.org || "{{org}}",
    senderName: senderName || "{{senderName}}",
    senderTitle: "BHN team",
  }), [contact, senderName]);

  // What's shown / copied: the draft when editing, else the saved template.
  const subjectRaw = editing ? draftSubject : tpl?.subject ?? "";
  const bodyRaw = editing ? draftBody : tpl?.body ?? "";
  const subject = personalize(subjectRaw, vars);
  const body = personalize(bodyRaw, vars);

  function selectTemplate(id: string) {
    setSelectedId(id);
    setEditing(false);
    setError(null);
    setNotice(null);
    setCopied(false);
  }
  function startEdit() {
    if (!tpl) return;
    setDraftSubject(tpl.subject);
    setDraftBody(tpl.body);
    setEditing(true);
    setAi("");
    setError(null);
    setNotice(null);
  }

  async function api(path: string, init: RequestInit) {
    const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...init });
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
    if (!res.ok) throw new Error(j.error ?? "Request failed.");
    return j;
  }

  async function save() {
    if (!tpl) return;
    setBusy("save");
    setError(null);
    try {
      const j = await api("/api/workspace/outreach/email-templates", {
        method: "PATCH",
        body: JSON.stringify({ id: tpl.id, subject: draftSubject, body: draftBody }),
      });
      setTemplates((cur) => cur.map((t) => (t.id === tpl.id ? { ...t, subject: j.subject as string, body: j.body as string, isCustomized: true } : t)));
      setEditing(false);
      setNotice("Saved for the whole team.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function askAi() {
    if (!tpl) return;
    setBusy("ai");
    setError(null);
    try {
      const j = await api("/api/workspace/outreach/email-templates/assist", {
        method: "POST",
        body: JSON.stringify({ id: tpl.id, instruction: ai, subject: draftSubject, body: draftBody }),
      });
      setDraftSubject(j.subject as string);
      setDraftBody(j.body as string);
      setNotice("AI draft loaded — review and Save.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function resetToDefault() {
    if (!tpl) return;
    if (!(await confirmDialog({
      title: `Reset “${tpl.label}” to the default copy?`,
      confirmLabel: "Reset",
      tone: "warning",
    }))) return;
    setBusy("reset");
    setError(null);
    try {
      await api(`/api/workspace/outreach/email-templates?id=${tpl.id}`, { method: "DELETE" });
      // Re-fetch isn't wired; reload to pull the restored default.
      window.location.reload();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy — select the text and copy manually.");
    }
  }

  function openInEmail() {
    const to = contact?.email ?? "";
    const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(url, "_blank");
  }

  async function logReachout() {
    if (!contact) return;
    setBusy("log");
    setError(null);
    try {
      await api(`/api/workspace/outreach/people/${contact.id}/touches`, {
        method: "POST",
        body: JSON.stringify({ kind: "email", note: `Sent “${tpl?.label}” outreach email` }),
      });
      setNotice(`Logged a reach-out for ${contact.name || "this contact"}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const inputCls = "w-full rounded-md border border-line bg-card-solid px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col rounded-2xl border border-line bg-card-solid shadow-elevated">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-subtle">Outreach</p>
            <h2 className="text-base font-bold text-fg">Email templates</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-elevated hover:text-fg"><X size={16} /></button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[200px_1fr]">
          {/* Template list */}
          <div className="border-b border-line sm:border-b-0 sm:border-r">
            <ul className="max-h-40 overflow-y-auto p-2 sm:max-h-none">
              {templates.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => selectTemplate(t.id)}
                    className={cn("flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12.5px]", t.id === selectedId ? "bg-brand-50 font-semibold text-brand-800" : "text-fg hover:bg-elevated/50")}
                  >
                    <Mail size={13} className="shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate">{t.label}</span>
                    {t.isCustomized && <BadgeCheck size={12} className="shrink-0 text-brand-600" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Detail */}
          <div className="min-h-0 overflow-y-auto p-4">
            {tpl && (
              <>
                <p className="text-[11.5px] text-muted">{tpl.when}</p>

                {/* Personalize for a contact */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-subtle"><UserRound size={11} /> Personalise for</span>
                  <select value={contactId} onChange={(e) => setContactId(e.target.value)} className={cn(inputCls, "w-auto max-w-[16rem]")}>
                    <option value="">— pick a contact (optional) —</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>{c.name || c.org || "Unnamed"}{c.org && c.name ? ` · ${c.org}` : ""}</option>
                    ))}
                  </select>
                  {contact && !contact.email && <span className="text-[11px] text-amber-700">No email on file — add one to use “Open in email”.</span>}
                </div>

                {!editing ? (
                  <>
                    {/* Preview */}
                    <div className="mt-3 rounded-lg border border-line bg-elevated/30 p-3">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-subtle">Subject</p>
                      <p className="mt-0.5 text-[13.5px] font-semibold text-fg">{subject}</p>
                      <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-subtle">Body</p>
                      <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-fg">{body}</p>
                    </div>

                    {/* Actions */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button type="button" onClick={copyEmail} className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-brand-700">
                        {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy email"}
                      </button>
                      <button type="button" onClick={openInEmail} disabled={!contact?.email} title={contact?.email ? "" : "Pick a contact with an email"} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-card-solid px-3 py-2 text-xs font-semibold text-fg hover:bg-elevated disabled:opacity-50">
                        <ExternalLink size={13} /> Open in email
                      </button>
                      {contact && (
                        <button type="button" onClick={logReachout} disabled={busy === "log"} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-card-solid px-3 py-2 text-xs font-semibold text-muted hover:bg-elevated hover:text-fg disabled:opacity-50">
                          {busy === "log" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Log as reach-out
                        </button>
                      )}
                      {canEdit && (
                        <span className="ml-auto flex items-center gap-2">
                          {tpl.isCustomized && (
                            <button type="button" onClick={resetToDefault} disabled={busy !== null} className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted hover:text-fg disabled:opacity-50"><RotateCcw size={11} /> Reset</button>
                          )}
                          <button type="button" onClick={startEdit} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-card-solid px-3 py-2 text-xs font-semibold text-fg hover:bg-elevated"><Pencil size={12} /> Edit</button>
                        </span>
                      )}
                    </div>
                    {contact && (
                      <p className="mt-2 text-[11px] text-subtle">Preview is filled in for {contact.name || "this contact"}. Unfilled {"{{tokens}}"} (program, event, link) are yours to complete before sending.</p>
                    )}
                  </>
                ) : (
                  /* Editor */
                  <div className="mt-3 space-y-3">
                    <div className="rounded-lg border border-brand-200 bg-brand-50/60 p-3">
                      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-brand-700"><Sparkles size={12} /> AI rewrite</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <input value={ai} onChange={(e) => setAi(e.target.value)} onKeyDown={(e) => e.key === "Enter" && busy === null && askAi()} placeholder="e.g. Warmer and shorter · Lead with what's in it for them" className="min-w-[14rem] flex-1 rounded-md border border-brand-200 bg-card-solid px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-400" />
                        <button type="button" onClick={askAi} disabled={busy !== null || ai.trim().length < 3} className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-brand-700 disabled:opacity-50">{busy === "ai" ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Rewrite</button>
                      </div>
                    </div>
                    <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-subtle">Subject</span><input value={draftSubject} onChange={(e) => setDraftSubject(e.target.value)} className={cn(inputCls, "mt-1")} /></label>
                    <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-subtle">Body</span><textarea value={draftBody} onChange={(e) => setDraftBody(e.target.value)} rows={10} className={cn(inputCls, "mt-1 resize-y font-mono text-[12.5px] leading-relaxed")} /></label>
                    <details className="rounded-lg border border-line bg-elevated/30 px-3 py-2">
                      <summary className="cursor-pointer text-[11.5px] font-semibold text-muted hover:text-fg">Placeholders you can use</summary>
                      <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                        {placeholders.map((p) => <li key={p.token} className="text-[11.5px] text-muted"><code className="rounded bg-elevated px-1 py-0.5 font-mono text-[10.5px] text-fg">{p.token}</code> — {p.desc}</li>)}
                      </ul>
                    </details>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={save} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50">{busy === "save" ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save</button>
                      <button type="button" onClick={() => setEditing(false)} className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold text-muted hover:text-fg"><X size={13} /> Cancel</button>
                    </div>
                  </div>
                )}

                {error && <p className="mt-2 text-[12px] font-medium text-rose-700">{error}</p>}
                {notice && <p className="mt-2 text-[12px] font-medium text-brand-700">{notice}</p>}
              </>
            )}
          </div>
        </div>
      </div>
      {confirmNode}
    </div>
  );
}
