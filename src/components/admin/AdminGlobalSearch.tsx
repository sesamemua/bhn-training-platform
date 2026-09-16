"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, X, Users, BookOpen, Briefcase, Loader2 } from "lucide-react";
import { pausedPillarsActive } from "@/lib/deploy/paused";

interface ResultItem {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  indexName: string;
  queryID: string;
  position: number;
}
interface SearchResults {
  users: ResultItem[];
  courses: ResultItem[];
  postings: ResultItem[];
}
const EMPTY: SearchResults = { users: [], courses: [], postings: [] };

const SECTIONS: { key: keyof SearchResults; label: string; icon: React.ElementType }[] = [
  { key: "users", label: "Users", icon: Users },
  { key: "courses", label: "Courses", icon: BookOpen },
  { key: "postings", label: "Postings", icon: Briefcase },
];

/**
 * One search box across users, courses, and internship postings —
 * backed by Algolia (see api/admin/search + lib/algolia.ts). Debounced
 * client-side; the API itself no-ops under 2 characters. Every result
 * click reports an Insights event via /api/admin/search/click.
 */
export function AdminGlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Below 2 characters we simply don't fetch — no need to touch state for
  // that case at all (see displayResults below), which keeps this effect
  // free of the "setState synchronously on every short keystroke" pattern.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    // Same debounced-search idiom as SkillProfileClient's skill lookup —
    // the effect's own cleanup cancels the pending timeout, so this never
    // fires after the query has moved on; not a real cascading-render bug.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`);
        if (res.ok) setResults(await res.json());
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  // Derived, not stored: once the query drops below 2 characters there's
  // nothing to show, regardless of whatever the last fetch left in `results`.
  const displayResults = query.trim().length >= 2 ? results : EMPTY;
  const totalCount = displayResults.users.length + displayResults.courses.length + displayResults.postings.length;
  const showDropdown = open && query.trim().length >= 2;

  // Fire-and-forget Algolia Insights click event — never blocks navigation.
  function reportClick(item: ResultItem) {
    fetch("/api/admin/search/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        indexName: item.indexName,
        objectID: item.id,
        position: item.position,
        queryID: item.queryID,
      }),
    }).catch(() => {});
  }

  return (
    <div ref={boxRef} className="relative w-full max-w-sm">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle pointer-events-none" />
        <input
          id="admin-global-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          // Course and posting results are dropped where ENGAGE and
          // EXPERIENCE are paused (api/admin/search), so say users only.
          placeholder={pausedPillarsActive() ? "Search users…" : "Search users, courses, postings…"}
          aria-label={pausedPillarsActive() ? "Search users" : "Search users, courses, and postings"}
          className="w-full bg-card border border-line rounded-lg pl-9 pr-9 py-2 text-sm text-fg placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle hover:text-fg"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute z-40 mt-1.5 w-full bg-card-solid border border-line rounded-lg shadow-lg max-h-96 overflow-y-auto">
          {totalCount === 0 ? (
            <p className="px-3 py-3 text-sm text-muted">
              {loading ? "Searching…" : `No matches for “${query.trim()}”`}
            </p>
          ) : (
            SECTIONS.map(({ key, label, icon: Icon }) => {
              const items = displayResults[key];
              if (items.length === 0) return null;
              return (
                <div key={key} className="py-1.5 first:pt-2 last:pb-2">
                  <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-subtle flex items-center gap-1.5">
                    <Icon size={11} /> {label}
                  </p>
                  {items.map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={() => { reportClick(item); setOpen(false); setQuery(""); }}
                      className="block px-3 py-1.5 hover:bg-elevated"
                    >
                      <p className="text-sm text-fg font-medium truncate">{item.title}</p>
                      {item.subtitle && (
                        <p className="text-xs text-muted truncate">{item.subtitle}</p>
                      )}
                    </Link>
                  ))}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
