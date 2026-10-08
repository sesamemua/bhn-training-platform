import Link from "next/link";

/** The two halves of Workspace → Review. */
const TABS = [
  { id: "website", label: "Website review", href: "/admin/workspace/website-review" },
  { id: "design", label: "Design review", href: "/admin/workspace/website-review/design" },
] as const;

export function ReviewTabs({ active }: { active: (typeof TABS)[number]["id"] }) {
  return (
    <nav aria-label="Review" className="flex gap-1 border-b border-line">
      {TABS.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          aria-current={t.id === active ? "page" : undefined}
          className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-semibold ${t.id === active ? "border-brand-600 text-fg" : "border-transparent text-muted hover:text-fg"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
