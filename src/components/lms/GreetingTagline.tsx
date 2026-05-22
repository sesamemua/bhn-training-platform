"use client";
/**
 * Animated, AI-personalised tagline that sits just under the dashboard
 * "Hi, {name}." headline. Generates on first mount per session, caches
 * in sessionStorage so re-navigation doesn't burn a new AI call, and
 * lets the user thumbs-up / thumbs-down / turn it off entirely.
 *
 * Drop into any hero like:
 *   <GreetingTagline tone="dark" />        // light text on dark hero
 *   <GreetingTagline tone="light" />       // dark text on light bg
 *
 * The tone prop only flips the text colour ramp — the AI text is the
 * same. We aim for AA contrast on the most common hero backgrounds.
 */
import { useEffect, useRef, useState } from "react";
import { ThumbsUp, ThumbsDown, EyeOff, Sparkles, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const SESSION_KEY = "bhn-greeting-cache-v1";

interface CachedGreeting {
  text: string;
  off: boolean;
  source: "ai" | "fallback";
  storedAt: number; // ms epoch
}

const STALE_AFTER_MS = 60 * 60 * 1000; // 1 hour — enough that a tab open all day still feels fresh

interface Props {
  tone?: "dark" | "light";
  className?: string;
}

export function GreetingTagline({ tone = "dark", className }: Props) {
  const [text, setText] = useState<string>("");
  const [off, setOff] = useState(false);
  const [feedback, setFeedback] = useState<"like" | "dislike" | null>(null);
  const [loading, setLoading] = useState(true);
  const [animKey, setAnimKey] = useState(0);
  const fetchedOnce = useRef(false);

  // Prime from sessionStorage so re-navigation doesn't re-fetch.
  useEffect(() => {
    if (fetchedOnce.current) return;
    fetchedOnce.current = true;
    let cached: CachedGreeting | null = null;
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      cached = raw ? (JSON.parse(raw) as CachedGreeting) : null;
    } catch {}
    const isFresh = cached && Date.now() - cached.storedAt < STALE_AFTER_MS;
    if (isFresh && cached) {
      setText(cached.text);
      setOff(cached.off);
      setLoading(false);
      return;
    }
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      const r = await fetch("/api/greeting", { cache: "no-store" });
      const j = (await r.json()) as { text?: string; off?: boolean; source?: "ai" | "fallback" };
      const next: CachedGreeting = {
        text: j.text ?? "",
        off: !!j.off,
        source: j.source ?? "fallback",
        storedAt: Date.now(),
      };
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(next)); } catch {}
      setText(next.text);
      setOff(next.off);
      setAnimKey((k) => k + 1);
    } catch {
      setText("");
    } finally {
      setLoading(false);
    }
  }

  async function react(kind: "like" | "dislike") {
    setFeedback(kind);
    try {
      await fetch("/api/greeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: kind, text }),
      });
    } catch {}
  }

  async function turnOff() {
    setLoading(true);
    setOff(true);
    try {
      await fetch("/api/greeting", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ off: true }),
      });
      try { sessionStorage.removeItem(SESSION_KEY); } catch {}
    } finally {
      setLoading(false);
    }
  }

  if (off) return null;
  if (loading && !text) {
    return (
      <p className={cn(
        "mt-3 inline-flex items-center gap-2 text-sm",
        tone === "dark" ? "text-white/70" : "text-muted",
        className,
      )}>
        <Sparkles size={12} className="animate-pulse" />
        <span className="opacity-70">Generating a fresh thought…</span>
      </p>
    );
  }
  if (!text) return null;

  // Tone-aware classes.
  const taglineCls =
    tone === "dark"
      ? "text-white drop-shadow-on-dark-sm"
      : "text-fg";
  const subtleCls =
    tone === "dark" ? "text-white/85" : "text-muted";
  const chipBg =
    tone === "dark"
      ? "bg-white/10 hover:bg-white/20 border-white/25 text-white"
      : "bg-card-solid hover:bg-elevated border-line text-muted hover:text-fg";

  return (
    <div className={cn("mt-3 group/greet", className)}>
      <div className="relative inline-block max-w-[640px]">
        {/* The tagline itself — animated re-entry on refresh */}
        <p
          key={animKey}
          className={cn(
            "italic text-base md:text-lg leading-snug pr-2 animate-greeting-in",
            taglineCls,
          )}
        >
          <Sparkles
            size={14}
            className={cn(
              "inline-block mr-2 -mt-1 opacity-80",
              tone === "dark" ? "text-white" : "text-brand-600",
            )}
          />
          {text}
        </p>

        {/* Reaction strip — completely hidden until the user hovers (or
            tabs into) the tagline, so the line reads cleanly on its
            own. pointer-events disabled while invisible so the empty
            row below the line doesn't grab the cursor. */}
        <div
          className={cn(
            "mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-medium",
            "opacity-0 pointer-events-none",
            "group-hover/greet:opacity-100 group-hover/greet:pointer-events-auto",
            "focus-within:opacity-100 focus-within:pointer-events-auto",
            "transition-opacity duration-200",
          )}
        >
          <button
            type="button"
            onClick={() => react("like")}
            disabled={feedback !== null}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-1 rounded-full border transition-colors disabled:cursor-default",
              feedback === "like"
                ? "bg-emerald-500/90 border-emerald-300 text-white"
                : chipBg,
            )}
            aria-label="I like this greeting"
          >
            {feedback === "like" ? <Check size={11} /> : <ThumbsUp size={11} />}
            {feedback === "like" ? "Thanks" : "Nice"}
          </button>
          <button
            type="button"
            onClick={() => react("dislike")}
            disabled={feedback !== null}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-1 rounded-full border transition-colors disabled:cursor-default",
              feedback === "dislike"
                ? "bg-rose-500/90 border-rose-300 text-white"
                : chipBg,
            )}
            aria-label="Dislike this greeting"
          >
            {feedback === "dislike" ? <Check size={11} /> : <ThumbsDown size={11} />}
            {feedback === "dislike" ? "Logged" : "Meh"}
          </button>
          <button
            type="button"
            onClick={refresh}
            className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-full border transition-colors", chipBg)}
            aria-label="Generate another greeting"
            title="Try another"
          >
            <Sparkles size={11} /> Retry
          </button>
          <button
            type="button"
            onClick={turnOff}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-1 rounded-full border transition-colors ml-auto",
              chipBg,
            )}
            aria-label="Turn off greetings"
            title="Stop showing AI greetings"
          >
            <EyeOff size={11} /> Turn off
          </button>
          <span className={cn("text-[10px] tracking-wider uppercase", subtleCls)}>
            AI · today
          </span>
        </div>
      </div>
    </div>
  );
}
