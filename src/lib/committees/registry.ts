/**
 * Committee registry — the source of truth for what committees
 * exist on this platform.
 *
 * Two committees ship initially:
 *   • equip_review — reviews EQUIP funding applications. Members
 *                    automatically get read+write access to
 *                    /admin/equip even if their primary role
 *                    isn't `admin`.
 *   • hqp          — Highly Qualified Personnel committee. Pure
 *                    coordination surface (no admin overrides);
 *                    members get a sidebar section + welcome-
 *                    screen badge.
 *
 * Adding a third committee = append an entry here, ship a code
 * deploy. No schema migration (the `committee` column is plain
 * text — see CommitteeMembership in schema.prisma).
 *
 * Why a code-managed registry and not a DB-driven one?
 *  • Each committee has a hand-crafted set of sidebar links,
 *    permissions, and badge styling that can't be expressed in
 *    a generic settings table.
 *  • Listing committees in code keeps the typed
 *    `CommitteeSlug` union honest — autocomplete works, and
 *    `isCommitteeSlug()` rejects unknown values from query
 *    strings / form bodies / migrated rows.
 */

export type CommitteeSlug = "equip_review" | "hqp";

export interface CommitteeSidebarItem {
  /** Label shown in the sidebar nav. */
  label: string;
  /** App-router path. */
  href: string;
  /** Lucide icon name (resolved at render time so this registry
   *  stays tree-shake-friendly and doesn't pull every icon into
   *  every page that imports it). */
  icon: "Rocket" | "Users" | "Award" | "ClipboardList" | "Sparkles" | "Mail";
}

export interface CommitteeMeta {
  slug: CommitteeSlug;
  /** Human-readable name shown on welcome badges, admin pages,
   *  and audit logs. */
  name: string;
  /** Short tagline shown in the admin committee list + on the
   *  welcome badge tooltip. */
  description: string;
  /** Tailwind tone for the welcome-screen badge. Maps to
   *  bg-{tone}-100 text-{tone}-800 ring-{tone}-300 in the badge
   *  component — see /components/lms/CommitteeBadge.tsx. */
  badgeTone: "emerald" | "violet" | "amber" | "sky" | "rose";
  /** Sidebar items unlocked for members of this committee.
   *  Rendered under a "Committees" section in the LMS sidebar. */
  sidebarItems: CommitteeSidebarItem[];
  /** If true, members get read+write access to /admin/equip
   *  without holding the `admin` role. */
  grantsEquipReview?: boolean;
}

export const COMMITTEES: readonly CommitteeMeta[] = [
  {
    slug: "equip_review",
    name: "EQUIP Review Committee",
    description:
      "Reviews EQUIP funding applications (VentureConnect + VentureLift). Members can claim, approve, and fund applications.",
    badgeTone: "emerald",
    grantsEquipReview: true,
    sidebarItems: [
      { label: "EQUIP overview",     href: "/admin/equip/overview",  icon: "Sparkles" },
      { label: "EQUIP review queue", href: "/admin/equip",           icon: "Rocket" },
      { label: "EQUIP email templates", href: "/admin/equip/email-templates", icon: "Mail" },
      { label: "EQUIP deadlines",    href: "/admin/equip/deadlines", icon: "ClipboardList" },
    ],
  },
  {
    slug: "hqp",
    name: "HQP Advisory Committee",
    description:
      "Highly Qualified Personnel Advisory Committee. Oversees trainee quality, perspectives, and feedback across the partner network. Open to trainees and partners alike.",
    badgeTone: "violet",
    sidebarItems: [
      { label: "HQP dashboard", href: "/committee/hqp", icon: "Award" },
    ],
  },
  // NOTE: `equip_grant_review` and `engage_hqp_advisory` used to live
  // here as committees. Both were collapsed into first-class roles
  // (`equip_grant_reviewer` + `engage_hqp_advisor`) in
  // src/lib/auth.ts on user request — one concept per user-type
  // instead of role + committee membership. The role itself is the
  // seat; route guards check `role === "..."` directly.
] as const;

const SLUGS = new Set<string>(COMMITTEES.map((c) => c.slug));

/** Narrow a free-form string (query param, JSON body) to a known
 *  committee slug. Returns null if the input isn't recognised. */
export function isCommitteeSlug(s: unknown): s is CommitteeSlug {
  return typeof s === "string" && SLUGS.has(s);
}

export function getCommitteeMeta(slug: CommitteeSlug): CommitteeMeta {
  const meta = COMMITTEES.find((c) => c.slug === slug);
  // Type system guarantees a match — this throw is just to give
  // a clearer error if someone widens CommitteeSlug without
  // adding the registry entry.
  if (!meta) throw new Error(`Unknown committee slug: ${slug}`);
  return meta;
}

/** All committees that grant the equip_review override. Single-
 *  element list today, but expressed this way so future
 *  committees (e.g. an "equip_chair" super-reviewer slug) can
 *  also unlock the queue without a code change at the call
 *  site. */
export const EQUIP_REVIEW_COMMITTEES: CommitteeSlug[] = COMMITTEES
  .filter((c) => c.grantsEquipReview)
  .map((c) => c.slug);
