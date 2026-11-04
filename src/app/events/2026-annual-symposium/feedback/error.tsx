"use client";

export default function FeedbackError({ reset }: { reset: () => void }) {
  return <main data-theme="light" className="min-h-screen bg-bg px-6 py-16 text-fg"><div className="mx-auto max-w-xl"><h1 className="text-2xl font-bold">Community reflections</h1><p className="mt-4">We couldn’t load the reflections. Please try again.</p><button type="button" onClick={reset} className="mt-5 min-h-10 rounded-md border border-current px-4 py-2">Try again</button></div></main>;
}
