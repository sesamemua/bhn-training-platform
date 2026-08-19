"use client";

/**
 * Catches a render crash inside the flow-chart editor.
 *
 * Without one, a thrown error unmounts the whole route and Next's default
 * "This page couldn't load" takes over — which loses the unsaved chart and,
 * worse, tells nobody what actually broke. This keeps the failure local,
 * shows the message, and says plainly that the draft is safe.
 *
 * A class component because that is still the only way to implement
 * componentDidCatch.
 */
import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props { children: ReactNode }
interface State { error: Error | null; stack: string | null }

export class FlowChartBoundary extends Component<Props, State> {
  state: State = { error: null, stack: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // The component stack is shown, not just logged. A production build
    // minifies the message down to "Minified React error #185", which
    // names the fault but not the place — and the place is the entire
    // question. Three rounds of guessing at which component was looping
    // is what this is here to end.
    this.setState({ stack: info.componentStack ?? null });
    console.error("Flow chart editor crashed:", error, info.componentStack);
  }

  private report() {
    const { error, stack } = this.state;
    return [error?.message ?? String(error), "", (stack ?? "").trim()]
      .join("\n")
      .trim();
  }

  render() {
    const { error, stack } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="rounded-lg border border-amber-500/60 bg-amber-500/8 p-5">
        <p className="inline-flex items-center gap-2 text-[13px] font-bold text-amber-600">
          <AlertTriangle size={14} /> The editor hit a problem
        </p>
        <p className="mt-2 max-w-prose text-[12.5px] leading-relaxed text-muted">
          Your unsaved changes are kept — reloading this page will offer them
          back. Please send the message below; it says which part broke, which
          is the bit that is otherwise impossible to guess.
        </p>
        <pre className="mt-3 max-h-56 overflow-auto rounded-md border border-line bg-card p-3 text-[11.5px] leading-relaxed text-fg">
          {error.message || String(error)}
          {stack ? `\n${stack.trim()}` : ""}
        </pre>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            onClick={() => navigator.clipboard?.writeText(this.report())}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-brand-500"
          >
            Copy the details
          </button>
          <button
            onClick={() => this.setState({ error: null, stack: null })}
            className="rounded-md border border-line px-3 py-1.5 text-[12.5px] font-semibold text-fg hover:bg-elevated"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="rounded-md border border-line px-3 py-1.5 text-[12.5px] text-muted hover:bg-elevated hover:text-fg"
          >
            Reload the page
          </button>
        </div>
      </div>
    );
  }
}
