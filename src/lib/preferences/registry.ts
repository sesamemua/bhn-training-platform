/**
 * ════════════════════════════════════════════════════════════════
 *  SOURCE OF TRUTH — toggleable sidebar features.
 * ════════════════════════════════════════════════════════════════
 *
 * Every nav item a user can hide via the /profile/preferences
 * switchboard is registered here. Adding or removing a nav item
 * in src/components/lms/Sidebar.tsx WITHOUT touching this file
 * means the switchboard will silently drift out of sync with the
 * actual sidebar — new items will always be on (uncontrollable),
 * removed items will sit as dead toggles in user preferences.
 *
 * MAINTENANCE RULES — read every time you touch the sidebar:
 *
 *   1. Pick a stable id (kebab-case, prefixed by group). Once
 *      shipped, never change it — user preferences key off it.
 *      Renaming/restructuring? Use the deprecated[] array below
 *      and write a one-line migration note.
 *
 *   2. Slot it into the right GROUP_ID. If the new feature
 *      genuinely doesn't fit any group, add a new GroupDef
 *      below (and ideally pick a colour from the gradient
 *      palette so the switchboard reads consistently).
 *
 *   3. Default it on or off thoughtfully. New features default
 *      ON unless they're niche / admin-only.
 *
 *   4. The corresponding NavItem in Sidebar.tsx MUST carry the
 *      same featureId — that's how filtering works.
 *
 *   5. If you remove a feature entirely, leave its id in
 *      `deprecated` for one release cycle so users who have it
 *      in their `hidden` or `order` arrays don't get confusing
 *      stale state.
 *
 * The shape is small on purpose — id, label, description, group,
 * defaultEnabled. Per-feature route hints / icons live on the
 * Sidebar.tsx NavItem side; this registry stays
 * presentation-agnostic so the same ids can drive other surfaces
 * (dashboard tiles, command palette) later without rewiring.
 */

import { isPausedPath } from "@/lib/deploy/paused";

export type FeatureGroupId =
  | "profile"
  | "learn"
  | "experience"
  | "equip"
  | "engage"
  | "admin"
  | "account";

export interface FeatureGroupDef {
  id: FeatureGroupId;
  label: string;
  description: string;
  /** Used by the switchboard to colour-tint the group card. Matches
   *  the "line + gradient" aesthetic the rest of the platform uses. */
  gradient: string;
}

export const GROUPS: FeatureGroupDef[] = [
  {
    id: "profile",
    label: "Profile",
    description: "Your personal surfaces — application materials, resumes, the things you build for yourself.",
    gradient: "from-brand-400/30 via-brand-300/20 to-transparent",
  },
  {
    id: "learn",
    label: "Learn",
    description: "Courses, pathways, certificates, gradebook — anything in the learning loop.",
    gradient: "from-emerald-400/30 via-emerald-300/20 to-transparent",
  },
  {
    id: "experience",
    label: "Experience",
    description: "Industry placements — talent pool, internships, applications, interviews, matches.",
    gradient: "from-violet-400/30 via-violet-300/20 to-transparent",
  },
  {
    id: "equip",
    label: "EQUIP",
    description: "Equipment & infrastructure funding pillar — applications, deadlines, review.",
    gradient: "from-amber-400/30 via-amber-300/20 to-transparent",
  },
  {
    id: "engage",
    label: "Engage",
    description: "Events, committees, community programmes, roadmap inputs.",
    gradient: "from-cyan-400/30 via-cyan-300/20 to-transparent",
  },
  {
    id: "admin",
    label: "Admin",
    description: "Staff-only tooling. Only renders for instructors / admins / superadmins / industrial mentors.",
    gradient: "from-rose-400/30 via-rose-300/20 to-transparent",
  },
  {
    id: "account",
    label: "Account",
    description: "Settings, preferences, credentials, credits.",
    gradient: "from-slate-400/30 via-slate-300/20 to-transparent",
  },
];

export interface FeatureDef {
  id: string;
  label: string;
  description: string;
  group: FeatureGroupId;
  /** Default-visible? `false` means the feature is registered but
   *  hidden until the user explicitly opts in via the switchboard. */
  defaultEnabled: boolean;
  /** Some features are role-gated regardless of preferences (e.g.
   *  admin tools). The switchboard surfaces them only to eligible
   *  roles; users who can't access them never see the toggle. */
  requiredRoleRank?: number; // 0 user, 1 instructor+, 2 admin+, 3 super
}

/** The toggleable nav items. Order here is the DEFAULT order
 *  (preserved when the user hasn't reordered anything explicitly).
 *  Each id corresponds 1:1 to a NavItem.featureId in Sidebar.tsx. */
export const FEATURES: FeatureDef[] = [
  // Profile -------------------------------------------------------
  { id: "profile-application", label: "Application Builder",      description: "Build your reusable resume + 1-min video intro + elevator pitch.",                         group: "profile",    defaultEnabled: true },
  { id: "profile-master",      label: "Bullet Bank",               description: "Your library of every accomplishment bullet. Tailored drafts pull from it; AI uses it to fit any posting. Snapshots are downloadable.", group: "profile",    defaultEnabled: true },
  { id: "profile-tailor",      label: "Job Tailor",                description: "Paste a job URL or JD — AI detects the ATS, runs a gap analysis vs your master, drafts a grounded resume + cover, QA-checks them, and exports per-ATS files.", group: "profile",    defaultEnabled: true },
  { id: "profile-resumes",     label: "Resume tailoring",          description: "Tailored drafts that pull from your master library, with version history, mentor comments, PDF export.",            group: "profile",    defaultEnabled: true },
  { id: "profile-skills",      label: "My skills",                 description: "Your skill profile — inferred, extracted, self-claimed.",                                 group: "profile",    defaultEnabled: true },
  { id: "profile-stories",     label: "STAR stories",              description: "Reusable behavioural-interview stories you draft once and pull into applications.",       group: "profile",    defaultEnabled: true },
  { id: "profile-job-folders", label: "Job folders",               description: "Per-role workspaces — JD + tailored resume + cover letter + interview prep, all in one place.", group: "profile",    defaultEnabled: true },

  // Learn ---------------------------------------------------------
  { id: "learn-dashboard",     label: "Dashboard",                 description: "Your home — pickup-where-you-left-off, upcoming events, notifications.",                  group: "learn",      defaultEnabled: true },
  { id: "learn-courses",       label: "Course catalog",            description: "Browse and enrol in courses. Filter by topic, skill, language, level.",                   group: "learn",      defaultEnabled: true },
  { id: "learn-my-courses",    label: "My Courses",                description: "Your active + completed enrolments. Resume where you left off.",                          group: "learn",      defaultEnabled: true },
  { id: "learn-pathways",      label: "Pathways",                  description: "Curated multi-course tracks for specific roles + skill sets.",                            group: "learn",      defaultEnabled: true },
  { id: "learn-gradebook",     label: "Gradebook",                 description: "Per-course assessment scores + completion status.",                                       group: "learn",      defaultEnabled: false },
  { id: "learn-certificates",  label: "Certificates",              description: "Every credential you've earned; each has a public verify link.",                          group: "learn",      defaultEnabled: true },
  { id: "learn-credits",       label: "My Credits",                description: "Balance + grant/spend log + apply-for-more.",                                              group: "learn",      defaultEnabled: true },
  { id: "learn-rewards",       label: "Rewards",                   description: "BHN merch milestones at credit thresholds.",                                              group: "learn",      defaultEnabled: false },

  // Experience ----------------------------------------------------
  { id: "experience-guide",        label: "Experience guide",        description: "End-to-end explainer for the EXPERIENCE program.",                                  group: "experience", defaultEnabled: true },
  { id: "experience-talent",       label: "Talent Application",      description: "Submit your bio + supervisor letter + transcript + resume + STAR video.",          group: "experience", defaultEnabled: true },
  { id: "experience-internships",  label: "Internships",             description: "Live job board from BHN industry partners.",                                       group: "experience", defaultEnabled: true },
  { id: "experience-tracker",      label: "Application tracker",     description: "Every application you've submitted + employer's pipeline stage.",                  group: "experience", defaultEnabled: true },
  { id: "experience-interviews",   label: "Interviews",              description: "Scheduled interviews + prep checklists.",                                          group: "experience", defaultEnabled: true },
  { id: "experience-matches",      label: "AI Matches",              description: "AI-ranked internship + posting matches based on your skill profile.",              group: "experience", defaultEnabled: true },
  { id: "experience-talent-pool",  label: "Talent pool",             description: "If you're admin: the shared employer-facing pool. If you're a trainee: nothing.", group: "experience", defaultEnabled: false },
  { id: "experience-simulator",    label: "Role-play (RPG)",         description: "AI role-play simulator for interview + workplace scenarios.",                      group: "experience", defaultEnabled: true },
  { id: "experience-mock-interview", label: "Mock Interview",        description: "Voice-or-type interview practice: AI asks role-tailored questions, scores each answer, gives an overall debrief.", group: "experience", defaultEnabled: true },
  { id: "experience-career-paths", label: "Career paths",            description: "Six tracks mapping Junior → VP journeys with course recommendations + cross-tree branch points.", group: "experience", defaultEnabled: true },
  { id: "experience-facilities",   label: "Facilities map",          description: "Map of Canadian biomanufacturing facilities — every dot is a real plant or institute. Zoom + click for details.", group: "experience", defaultEnabled: true },
  { id: "experience-equip-page",   label: "Equip me",                description: "Personal-development equipment grants.",                                           group: "experience", defaultEnabled: false },
  { id: "experience-buddy",        label: "Buddy hub",               description: "Find a study/accountability buddy.",                                               group: "experience", defaultEnabled: false },

  // Engage --------------------------------------------------------
  { id: "engage-events",       label: "Events",                    description: "BHN Annual Symposium + Training Week + workshops.",                                       group: "engage",     defaultEnabled: true },
  { id: "engage-committee",    label: "Committees",                description: "Memberships in the platform's advisory + review committees.",                              group: "engage",     defaultEnabled: false },
  { id: "engage-changelog",    label: "Changelog",                 description: "What's new on the platform — released features, fixes, improvements.",                    group: "engage",     defaultEnabled: true },
  { id: "engage-roadmap",      label: "Roadmap",                   description: "What's coming next + ideas the community has voted on.",                                  group: "engage",     defaultEnabled: false },
  { id: "engage-themes",       label: "Themes",                    description: "Theme proposals + voting.",                                                                group: "engage",     defaultEnabled: false },

  // EQUIP ---------------------------------------------------------
  { id: "equip-funding",       label: "EQUIP · Funding",           description: "VentureConnect + VentureLift funding applications.",                                       group: "equip",      defaultEnabled: false },
  { id: "equip-tracker",       label: "EQUIP · My applications",   description: "Your in-flight EQUIP funding applications + their status.",                              group: "equip",      defaultEnabled: false },
  { id: "equip-deadlines",     label: "EQUIP · Deadlines",         description: "Upcoming review windows + submission deadlines.",                                          group: "equip",      defaultEnabled: false },
  // (Most EQUIP entries are admin-only — they're toggled under "admin" below.)

  // Account -------------------------------------------------------
  { id: "account-profile",     label: "My profile",                description: "Account info, password, role requests, and the Feature switcher board (this).",         group: "account",    defaultEnabled: true },
  { id: "account-preferences", label: "Preferences (legacy)",      description: "Standalone /profile/preferences page — kept for deep-link compatibility. The canonical home is now /profile.", group: "account",    defaultEnabled: false },
  { id: "account-shortcuts",   label: "Keyboard shortcuts",        description: "Rebind the platform-wide shortcuts (x for role toggle, ? for help).",                     group: "account",    defaultEnabled: false },
];

/** Deprecated ids — preserved here so user prefs containing them
 *  don't get treated as unknown garbage. Drop after one release. */
export const DEPRECATED_FEATURE_IDS: string[] = [];

/** Quick lookup. */
export const FEATURES_BY_ID = new Map(FEATURES.map((f) => [f.id, f]));

/** Feature ids visible in the "Minimal" preset — what we recommend
 *  for users who want the bare-minimum dashboard experience. */
export const MINIMAL_PRESET = new Set([
  "learn-dashboard",
  "learn-courses",
  "learn-my-courses",
  "profile-master",
  "profile-resumes",
  "account-preferences",
]);

/** Feature ids included in the "Default" preset (every feature whose
 *  `defaultEnabled` is true). Computed eagerly for cheap reuse. */
export const DEFAULT_PRESET = new Set(
  FEATURES.filter((f) => f.defaultEnabled).map((f) => f.id),
);

/** Feature ids in the "Full" preset — literally every registered
 *  feature (less the role-gated ones the user can't see). */
export const FULL_PRESET = new Set(FEATURES.map((f) => f.id));

/** Helper — list of FeatureDefs in a group, in registry order. */
export function featuresInGroup(groupId: FeatureGroupId): FeatureDef[] {
  return FEATURES.filter((f) => f.group === groupId);
}

/**
 * The sidebar route behind each feature, copied from the NavItems in
 * src/components/lms/Sidebar.tsx (tests/unit/paused-nav.test.tsx fails if
 * the two drift). Only used to hide the toggles of features whose page is
 * paused on this deployment (ENGAGE + EXPERIENCE on the production site,
 * see deploy/paused-routes.mjs). Features without a sidebar link are not
 * listed, except the talent pool, whose page is paused with the rest.
 */
export const FEATURE_HREF: Readonly<Record<string, string>> = {
  "learn-dashboard": "/dashboard",
  "learn-courses": "/courses",
  "learn-pathways": "/pathways",
  "learn-my-courses": "/my-courses",
  "learn-gradebook": "/gradebook",
  "learn-certificates": "/certificates",
  "learn-credits": "/credits",
  "learn-rewards": "/rewards",
  "engage-events": "/events",
  "experience-guide": "/experience",
  "profile-application": "/profile/application",
  "profile-master": "/profile/master",
  "profile-tailor": "/profile/tailor",
  "profile-resumes": "/profile/resumes",
  "profile-job-folders": "/profile/job-folders",
  "experience-talent": "/forms/talent-application",
  "experience-internships": "/internships",
  "experience-matches": "/profile/matches",
  "experience-simulator": "/simulator",
  "experience-mock-interview": "/mock-interview",
  "experience-career-paths": "/career-paths",
  "experience-facilities": "/experience/facilities",
  "experience-tracker": "/profile/applications",
  "profile-skills": "/profile/skills",
  "profile-stories": "/profile/stories",
  "experience-interviews": "/interviews",
  "experience-buddy": "/buddy",
  "engage-changelog": "/changelog",
  "equip-funding": "/equip",
  "equip-tracker": "/equip/my-applications",
  "experience-talent-pool": "/talent-pool",
};

/** Is this feature's page paused on this deployment? Always false where nothing is paused. */
export function isFeaturePaused(featureId: string): boolean {
  return isPausedPath(FEATURE_HREF[featureId]);
}
