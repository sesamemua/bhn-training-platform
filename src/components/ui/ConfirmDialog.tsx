"use client";

/**
 * ConfirmDialog — branded replacement for window.confirm().
 *
 * Opens beside the button that asked (see AnchoredCard), not as a
 * centred modal: nothing on the platform uses browser pop-ups or modal
 * "are you sure?" boxes. With `acknowledgeOnly` it replaces alert() —
 * one OK button.
 *
 * The browser-native confirm() is functional but jarring on a
 * designed surface — flat OS chrome, no theming, no description,
 * no destructive vs neutral distinction. This component gives the
 * same primitive (ask a yes/no question, get a boolean) inside the
 * platform's visual language: rounded card, brand-tinted icon disc,
 * soft gradient header, OK / Cancel pair styled per the prompt's
 * stakes.
 *
 * Imperative API mirrors window.confirm so call-sites read naturally:
 *
 *   const ok = await confirmDialog({
 *     title: "Clear every field on this form?",
 *     description: "This can't be undone — but you can refill it.",
 *     confirmLabel: "Clear form",
 *     tone: "destructive",
 *   });
 *   if (!ok) return;
 *
 * Three tones map onto the destructive-confirmation hierarchy docs:
 *   • "neutral"     — routine choices ("Open in new tab?")
 *   • "warning"     — moderate-risk but recoverable ("Discard draft?")
 *   • "destructive" — irreversible body actions ("Hard-delete row?")
 *
 * For irreversible WORK-DESTROYING actions (hard-delete a resume,
 * wipe a workspace) reach for LaunchSwitch instead — its cover-flip
 * + countdown ritual is the right ceremony for that tier. Use
 * ConfirmDialog for everything between "no confirmation needed" and
 * "ceremony required".
 *
 * Saved to `/admin/design-system` alongside InputDialog as the
 * canonical confirm primitive.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, AlertCircle, X, Check, HelpCircle } from "lucide-react";
import { AnchoredCard, currentAnchor } from "./AnchoredCard";

export type ConfirmTone = "neutral" | "warning" | "destructive";

export interface ConfirmDialogOptions {
  /** Bold heading at the top of the dialog. Phrase as a question
   *  if appropriate — "Clear every field?", "Leave this course?". */
  title: string;
  /** Optional one-or-two-sentence subhead. Use to spell out what
   *  happens + whether it's reversible. */
  description?: string;
  /** Text on the confirm button. Default depends on tone:
   *   • neutral     → "Confirm"
   *   • warning     → "Continue"
   *   • destructive → "Delete" */
  confirmLabel?: string;
  /** Text on the cancel button. Default "Cancel". */
  cancelLabel?: string;
  /** Visual treatment. Default "neutral". Drives icon, header
   *  gradient tint, and confirm-button colour. */
  tone?: ConfirmTone;
  /** Optional icon override. Defaults match the tone. */
  icon?: React.ElementType;
  /** A notice rather than a question (in place of alert()): one OK button. */
  acknowledgeOnly?: boolean;
}

interface OpenState extends ConfirmDialogOptions {
  open: true;
  resolve: (value: boolean) => void;
  anchor: DOMRect | null;
}
interface ClosedState {
  open: false;
}
type State = OpenState | ClosedState;

/** Hook variant — call once per page; returns a function that opens
 *  the dialog and an element to render somewhere. */
export function useConfirmDialog() {
  const [state, setState] = useState<State>({ open: false });

  const confirmDialog = useCallback((opts: ConfirmDialogOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ open: true, resolve, anchor: currentAnchor(), ...opts });
    });
  }, []);

  function close(value: boolean) {
    if (state.open) {
      state.resolve(value);
      setState({ open: false });
    }
  }

  const node = state.open ? <Dialog opts={state} onClose={close} /> : null;
  return { confirmDialog, node };
}

// ── Internals ───────────────────────────────────────────────────

const TONE_DEFAULTS: Record<ConfirmTone, {
  icon: React.ElementType;
  confirmLabel: string;
  iconDisc: string;
  headerGrad: string;
  confirmBtn: string;
}> = {
  neutral: {
    icon: HelpCircle,
    confirmLabel: "Confirm",
    iconDisc: "bg-brand-600 text-white",
    headerGrad: "from-brand-100/60 via-brand-50/40 to-transparent",
    confirmBtn: "bg-brand-600 text-white hover:bg-brand-700",
  },
  warning: {
    icon: AlertTriangle,
    confirmLabel: "Continue",
    iconDisc: "bg-amber-500 text-white",
    headerGrad: "from-amber-100/70 via-amber-50/40 to-transparent",
    confirmBtn: "bg-amber-600 text-white hover:bg-amber-700",
  },
  destructive: {
    icon: AlertCircle,
    confirmLabel: "Delete",
    iconDisc: "bg-rose-600 text-white",
    headerGrad: "from-rose-100/70 via-rose-50/40 to-transparent",
    confirmBtn: "bg-rose-600 text-white hover:bg-rose-700",
  },
};

function Dialog({
  opts, onClose,
}: {
  opts: OpenState;
  onClose: (value: boolean) => void;
}) {
  const tone = opts.tone ?? "neutral";
  const toneDefaults = TONE_DEFAULTS[tone];
  const Icon = opts.icon ?? toneDefaults.icon;
  const {
    title, description,
    confirmLabel = toneDefaults.confirmLabel,
    cancelLabel = "Cancel",
  } = opts;

  const confirmRef = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  const descriptionId = useId();

  // Autofocus the confirm button for keyboard-driven users. Note —
  // we intentionally focus the CONFIRM, not the cancel: native
  // window.confirm() does the same (OK is the default), and most
  // confirm flows want a fast Enter-to-proceed path for muscle
  // memory. For destructive tones the user still has to read +
  // press Enter deliberately, which is the right amount of friction
  // for "you sure?" prompts. Truly irreversible body actions get
  // upgraded to LaunchSwitch, not ConfirmDialog.
  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  // Esc cancels, Enter confirms (handled here so the user doesn't
  // have to tab into the button first).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Enter") {
        e.preventDefault();
        onClose(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <AnchoredCard anchor={opts.anchor} onDismiss={() => onClose(false)} role="alertdialog" label={title}>
      <div aria-labelledby={headingId} aria-describedby={description ? descriptionId : undefined}>
        <div className={`bg-gradient-to-r ${toneDefaults.headerGrad} px-3.5 py-3 flex items-start gap-2.5 border-b border-line`}>
          <span className={`inline-flex w-7 h-7 rounded-lg items-center justify-center shrink-0 ${toneDefaults.iconDisc}`}>
            <Icon size={14} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={headingId} className="text-[13.5px] font-semibold text-fg leading-snug">{title}</h2>
            {description && <p id={descriptionId} className="text-[12px] text-fg-muted mt-0.5 leading-snug">{description}</p>}
          </div>
          <button type="button" onClick={() => onClose(false)} aria-label="Cancel" className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded text-fg-muted hover:text-fg hover:bg-elevated">
            <X size={13} />
          </button>
        </div>
        <div className="px-3.5 py-2.5 flex items-center justify-end gap-2">
          {!opts.acknowledgeOnly && (
            <button type="button" onClick={() => onClose(false)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-fg-muted hover:bg-elevated">
              {cancelLabel}
            </button>
          )}
          <button ref={confirmRef} type="button" onClick={() => onClose(true)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${toneDefaults.confirmBtn}`}>
            <Check size={12} /> {opts.acknowledgeOnly ? (opts.confirmLabel ?? "OK") : confirmLabel}
          </button>
        </div>
      </div>
    </AnchoredCard>
  );
}
