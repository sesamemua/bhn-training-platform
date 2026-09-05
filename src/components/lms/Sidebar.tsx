"use client";
import { useRef, useState, useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/ui/Logo";
import { ThemePicker } from "@/components/ui/ThemePicker";
import { RoleSwitcher } from "@/components/admin/RoleSwitcher";
import { useT } from "@/lib/i18n/I18nProvider";
import { COMMITTEES, type CommitteeSidebarItem } from "@/lib/committees/registry";
import {
  LayoutDashboard,
  BookOpen,
  GraduationCap,
  Award,
  BadgeCheck,
  BarChart3,
  FileBarChart,
  Users,
  Settings,
  LogOut,
  ChevronRight, ChevronDown,
  Coins,
  FileText,
  Megaphone,
  ShieldCheck,
  ClipboardList,
  UsersRound,
  Link2,
  Layers,
  Sparkles,
  Pipette,
  LineChart,
  Coins as CoinsIcon,
  UserCog,
  HeartHandshake,
  Handshake,
  Briefcase,
  Users2,
  Building2,
  FilePlus,
  ListChecks,
  Activity,
  Mail,
  Inbox,
  Calendar,
  GitBranch,
  Bell,
  Lightbulb,
  FlaskConical,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Workflow,
  X,
  Compass,
  Milestone,
  MapPin,
  Mic,
  Gift,
  Rocket,
  Palette,
  Ghost,
  MessageSquare,
  Gauge,
  Sliders, SlidersHorizontal, FolderOpen, Library,
  Eye,
  Drama,
  Theater,
  Clapperboard,
  BookUser,
  Radar,
  Search,
  CalendarClock, MessageSquareText, Images, Speaker, ExternalLink} from "lucide-react";
import { NotificationBell } from "@/components/ui/NotificationInbox";
import { AdminGlobalSearch } from "@/components/admin/AdminGlobalSearch";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  minRole?: "instructor" | "admin" | "superadmin";
  exact?: boolean;
  /** Stable id that maps this item to a row in the preferences
   *  switchboard (src/lib/preferences/registry.ts). When set, the
   *  Sidebar filters the item out if the viewing user has it hidden
   *  in their featurePrefs. Items without a featureId aren't
   *  user-hideable (e.g. the dashboard always shows). */
  featureId?: string;
  /** One-or-two-sentence "what does this do" surfaced as a hover/focus
   *  popover next to the link. Kept English-only for now; if we localize
   *  later, swap for descriptionKey + dictionary entry. */
  description?: string;
  /** Optional queue-badge key. When the parent passes a queueCounts
   *  map (admin sidebar only), the matching count is rendered as a
   *  small chip to the right of the label. Absent / 0 → no badge.
   *  Keep in sync with the QueueBadgeKey union in
   *  src/lib/admin/queue-counts.ts. */
  badgeKey?: string;
}

// Always-visible top item. Dashboard intentionally has no featureId
// because hiding it leaves a user with nowhere to land — keep it
// unhideable; the switchboard registry references "learn-dashboard"
// but the toggle is informational only.
const dashboardItem: NavItem & { labelKey: string } = {
  label: "Dashboard", labelKey: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard, exact: true,
  featureId: "learn-dashboard",
  description: "Home base. What's in progress, your credit balance, and quick links into the catalog and pathways.",
};

// ENGAGE — the learning loop: catalog → pathway → progress → credits → rewards.
const engageItems: (NavItem & { labelKey: string })[] = [
  { label: "Course Catalog",     labelKey: "nav.catalog",     href: "/courses", icon: BookOpen,
    featureId: "learn-courses",
    description: "Every published course. Natural-language search ranks results by what each course actually covers, not just keyword matches." },
  { label: "Learning Pathways",  labelKey: "nav.pathways",    href: "/pathways", icon: Layers,
    featureId: "learn-pathways",
    description: "Multi-course learning journeys with a single certificate at the end. Some are open; gated ones need admin approval." },
  { label: "My Courses",         labelKey: "nav.myCourses",   href: "/my-courses", icon: GraduationCap,
    featureId: "learn-my-courses",
    description: "Active enrollments and completed courses. Pick up where you left off." },
  { label: "Gradebook",          labelKey: "nav.gradebook",   href: "/gradebook", icon: BarChart3,
    featureId: "learn-gradebook",
    description: "Your grades across every course — assessment scores, completion status, time spent." },
  { label: "Certificates",       labelKey: "nav.certificates",href: "/certificates", icon: Award,
    featureId: "learn-certificates",
    description: "Every credential you've earned. Each has a public verify link to share with employers." },
  { label: "Certifications",     labelKey: "nav.certifications", href: "/certifications", icon: BadgeCheck,
    description: "Multi-level professional certifications — work up through Foundation, Practitioner, and Advanced tiers, earning a credential at each." },
  { label: "My Credits",         labelKey: "nav.credits",     href: "/credits", icon: Coins,
    featureId: "learn-credits",
    description: "Balance plus a log of every grant and spend. Apply for additional credits here." },
  { label: "Rewards",            labelKey: "nav.rewards",     href: "/rewards", icon: Gift,
    featureId: "learn-rewards",
    description: "BHN merch rewards at 2,500 and 5,000 credits trained. Pickup at U of T or request mailing." },
  { label: "Events",             labelKey: "nav.events",      href: "/events", icon: Calendar,
    featureId: "engage-events",
    description: "BHN Annual Symposium & Training Week. Workshops, agenda, speakers. Register here." },
];

// MY PROFILE section retired from the sidebar — it carried a single
// link to /profile that duplicated the avatar at the bottom-left of
// the sidebar (which already opens the same page). One affordance
// per surface keeps the nav scannable. The /profile route + the
// Feature switcher board it contains are unaffected; reach them via
// the avatar.

// EXPERIENCE — applications and connections to industry placements.
// Renamed (8 May 2026) from "My Application" / "My Applications" to
// "Application Builder" / "Application Tracker" — the s/no-s
// distinction next to each other was demonstrably confusing. Routes
// kept the same so deep links stay alive.
const experienceItems: (NavItem & { labelKey: string })[] = [
  { label: "How it works",              labelKey: "nav.experienceGuide", href: "/experience",            icon: Compass,
    featureId: "experience-guide",
    description: "End-to-end explainer for the EXPERIENCE program — flow chart + step-by-step. Hover any highlighted item to find the matching control in your sidebar." },
  { label: "Application Builder",       labelKey: "nav.application", href: "/profile/application",      icon: FileText,
    featureId: "profile-application",
    description: "Build a reusable resume + 1-min video intro + elevator pitch. Made once; auto-attached to every application form." },
  { label: "Bullet Bank",               labelKey: "nav.masterResume", href: "/profile/master",       icon: Library,
    featureId: "profile-master",
    description: "Your library of every accomplishment bullet you've ever written. Tailored drafts pull from it; AI uses it to fit any posting. Version-locked + downloadable snapshots." },
  { label: "Job Tailor",                 labelKey: "nav.jobTailor", href: "/profile/tailor",         icon: Sparkles,
    featureId: "profile-tailor",
    description: "Paste a job URL or JD. AI detects the ATS, runs an honest gap analysis against your master library, drafts a grounded resume + cover (never inventing facts), QA-checks them, and exports the right files per ATS." },
  { label: "Resume Tailoring",           labelKey: "nav.resumeStructured", href: "/profile/resumes",       icon: FileText,
    featureId: "profile-resumes",
    description: "Tailored drafts that pull from your master library. Each has its own version history, mentor comments, and PDF export." },
  { label: "Job Folders",               labelKey: "nav.jobFolders", href: "/profile/job-folders",        icon: FolderOpen,
    featureId: "profile-job-folders",
    description: "One folder per role — JD, tailored resume, cover letter, interview prep. AI-generates cover letter + prep guide from your linked resume." },
  { label: "Talent Application",        labelKey: "nav.talent",      href: "/forms/talent-application", icon: Briefcase,
    featureId: "experience-talent",
    description: "Submit bio, supervisor letter, transcript, resume, and STAR video — we share with vetted industry partners." },
  { label: "Internships",               labelKey: "nav.internships", href: "/internships",              icon: Briefcase,
    featureId: "experience-internships",
    description: "Live job board of internship and co-op postings from BHN industry partners. Apply directly from here." },
  { label: "Matches for you",           labelKey: "nav.matches",     href: "/profile/matches",          icon: Sparkles,
    featureId: "experience-matches",
    description: "AI-ranked internship postings, scored against your skill profile + completed pathways. Each row shows the receipts — direct overlap, semantic similarity, pathway alignment, gaps, and honest caveats." },
  { label: "Career Simulator",          labelKey: "nav.simulator",   href: "/simulator",                icon: Drama,
    featureId: "experience-simulator",
    description: "Practise any role before you apply. Paste a job-posting URL and live through a 12-week quarter as that person — 1:1s, escalations, hiring, the QBR. Every choice moves five stats. End-of-quarter performance review from your VP." },
  { label: "Mock Interview",            labelKey: "nav.mockInterview", href: "/mock-interview",      icon: Mic,
    featureId: "experience-mock-interview",
    description: "Practise interviews out loud. The AI asks role-tailored questions; answer by voice (auto-transcribed) or by typing, and get an honest score + specific feedback on each answer, then an overall debrief." },
  { label: "Career Paths",              labelKey: "nav.careerPaths", href: "/career-paths",             icon: Milestone,
    featureId: "experience-career-paths",
    description: "Junior → VP journeys across six tracks (Bioprocess, Quality, Cell & Gene Therapy, Clinical, Business, Project Leadership). Each station carries typical roles, focus areas, recommended courses, and cross-tree branch points where careers commonly fork." },
  { label: "Facilities Map",            labelKey: "nav.facilitiesMap", href: "/experience/facilities",  icon: MapPin,
    featureId: "experience-facilities",
    description: "Interactive map of Canadian biomanufacturing facilities — every dot is a real company / plant / institute. Filter by province, zoom in to disambiguate dots in the same metro, click for the full record (status, address, specialisation, scale). Staff can rescan from the source URL." },
  { label: "Application Tracker",       labelKey: "nav.applications", href: "/profile/applications",    icon: ClipboardList,
    featureId: "experience-tracker",
    description: "Status of every application you've submitted across the platform — submitted, reviewed, interview, offer.",
    badgeKey: "offer-requests" },
  { label: "My Skills",                 labelKey: "nav.skills",      href: "/profile/skills",           icon: Lightbulb,
    featureId: "profile-skills",
    description: "Skills you've earned through training. Mapped against postings to surface ones you'd be strong for." },
  { label: "Story Bank",                labelKey: "nav.stories",     href: "/profile/stories",          icon: BookOpen,
    featureId: "profile-stories",
    description: "Reusable STAR-format stories from your application prep. Tagged by skill so the prep flow can suggest 'use this story' on the next posting." },
  { label: "Interviews",                labelKey: "nav.interviews",  href: "/interviews",               icon: Calendar,
    featureId: "experience-interviews",
    description: "Interviews scheduled with employers — date, format, link, and prep notes in one place.",
    badgeKey: "interview-requests" },
];

// Other top-level items rendered after the groups.
//
// Note: "Theme feedback" (/themes) deliberately does NOT live here.
// It's discovered from inside the ThemePicker dropdown in the footer
// — the place users actually engage with themes — rather than as a
// sidebar item most trainees would scroll past.
const miscItems: (NavItem & { labelKey: string })[] = [
  { label: "Learning Buddies",   labelKey: "nav.buddy",       href: "/buddy", icon: HeartHandshake,
    featureId: "experience-buddy",
    description: "Pair up with someone for accountability — share a course or pathway, see each other's progress, leave async notes.",
    badgeKey: "buddy-invites" },
  // labelKey is overridden per-role at render time ("What's new" for trainees).
  { label: "Changelog",          labelKey: "nav.changelog",   href: "/changelog", icon: Bell,
    featureId: "engage-changelog",
    description: "What's shipped recently — features, fixes, and improvements." },
  // Roadmap moved to the admin Platform group on user request.
];

// EQUIP — the funding loop: pillar #3 alongside Engage / Experience.
// Trainee-entrepreneurs apply for VentureConnect ($5K, conferences /
// pitch / networking) or VentureLift ($25K, accelerator / IP / proto)
// fully in-platform. No PDFs, profile pre-fill, auto-save, status
// tracking visible to the applicant.
const equipItems: (NavItem & { labelKey: string })[] = [
  { label: "Funding",                    labelKey: "nav.equip.funding",    href: "/equip", icon: Rocket, exact: true,
    featureId: "equip-funding",
    description: "BHN's commercialization-funding pillar. Start a new VentureConnect (≤$5K) or VentureLift (≤$25K) application; the 3-question wizard routes you to the right stream and pre-fills everything from your profile." },
  { label: "My applications",            labelKey: "nav.equip.tracker",    href: "/equip/my-applications", icon: ClipboardList,
    featureId: "equip-tracker",
    description: "Status of every EQUIP application you've submitted — draft, submitted, under review, approved, funded. Click any row for the full submission body and reviewer notes." },
];

const innovationFellowshipItem: NavItem = {
  label: "Innovation Fellowship",
  href: "/apply/innovation-fellowship",
  icon: Award,
  description: "Start an EQUIP Innovation Fellowship application using the online form.",
};

// The direct VentureConnect link — /apply/venture-connect, not
// /equip/apply/new?stream=venture_connect. Same form as the in-platform
// path, but skips the 3-question triage wizard and needs no account:
// built for a link that already says which grant it is (an email, a
// slide, a QR code) rather than someone starting from the dashboard.
const ventureConnectDirectItem: NavItem = {
  label: "VentureConnect (direct link)",
  href: "/apply/venture-connect",
  icon: ExternalLink,
  description: "The public VentureConnect application — same form, no triage questions and no BioHubNet account needed. Use this for a link you send directly (email, slide, QR code) rather than routing someone through the dashboard.",
};

const equipAdminDashboardItem: NavItem = {
  label: "Admin dashboard",
  href: "/admin/equip",
  icon: LayoutDashboard,
  minRole: "superadmin",
  description: "Open the EQUIP review dashboard to manage submitted applications and decisions.",
};

// EMPLOYER PORTAL — visible only when role === "employer".
//
// Overview is the brand-stage home (/employer) — wavy aurora cover
// banner, identity row, KPI tiles, action queue, hiring shopfront
// preview. My Postings is the working surface (/employer/postings)
// — postings + applicants + inline pipelines + the create-posting
// composer. They're complementary: Overview is the brand-facing
// landing; My Postings is where the hiring work happens.
//
// The workspace's DSPageHeader visual treatment is archived at
// /design-archive/employer-postings-workspace.html as a design
// reference; the working page itself is live and used here.
const employerItems: (NavItem & { labelKey: string })[] = [
  { label: "Overview",          labelKey: "nav.employerHome",       href: "/employer",            icon: Building2, exact: true,
    description: "Your company brand stage — profile (with one-URL AI auto-fill), live action queue, and the hiring shopfront trainees see on every posting. The pencil top-right opens the edit modal." },
  { label: "Hiring guide",       labelKey: "nav.employerGuide",      href: "/employer/how-it-works", icon: Compass,
    description: "End-to-end explainer for the hiring program — flow chart + step-by-step. Hover any highlighted item to find the matching control in your sidebar." },
  { label: "My Postings",       labelKey: "nav.employerPostings",   href: "/employer/postings",   icon: FilePlus,
    description: "Postings + applicants in one place. Expand any posting row to see its pipeline; the action queue at the top surfaces new applications, stale stages, and offers still awaiting response. Create new postings from this surface." },
  // The separate "Applicants" sidebar entry was removed — it
  // pointed at /employer/applicants, which is a redirect to this
  // same My-Postings workspace. The workspace already hosts the
  // applicant pipeline inline (via row-expand), so the dupe entry
  // was confusing without offering a different view. The
  // /employer/applicants URL still redirects here for old
  // bookmarks.
  { label: "Team",              labelKey: "nav.employerTeam",       href: "/employer/team",       icon: Users2,
    description: "Manage your company workspace — invite teammates, approve join requests, and set role permissions. Owner can change roles; manager+ can send invites.",
    badgeKey: "employer-join-requests" },
  { label: "Templates",         labelKey: "nav.employerTemplates",  href: "/employer/templates",  icon: Mail,
    description: "Email templates for rejections, interview invites, offers, and follow-ups. Supports merge variables like {{candidateFirstName}} and {{postingTitle}}." },
  { label: "Analytics",         labelKey: "nav.employerAnalytics",  href: "/employer/analytics",  icon: BarChart3,
    description: "Pipeline conversion rates, stage velocity, offer acceptance, and CSV export across all your postings." },
  { label: "Reports",           labelKey: "nav.employerReports",    href: "/employer/reports",    icon: FileBarChart,
    description: "Board-ready talent reports — executive KPI + OKR summary with RAG status, hiring funnel, time-to-fill, offer analytics, and more. Period-filtered, with targets you set and CSV / print export." },
  { label: "Calendar",          labelKey: "nav.employerCalendar",   href: "/employer/calendar",   icon: Calendar,
    description: "Week-view calendar of all upcoming interviews across your postings — navigate weeks, see pending vs. confirmed slots." },
  { label: "Talent pool",       labelKey: "nav.talentPool",         href: "/talent-pool",         icon: Users,
    description: "Browse approved talent-application members. View full applications and leave comments (visible to admins + employers, never to the applicant). Commenting unlocks only after admin approves the applicant's eligibility." },
];

// Admin menu, mirrored after the user-facing ENGAGE / EXPERIENCE
// vocabulary so the mental model stays consistent across roles.
//   Overview     — single link at the top of the section.
//   Engage       — learning-content + people management.
//   Experience   — employer side: invites, applicant flows, demos.
//   Platform     — analytics, audit, system, superadmin settings.
const adminOverview: NavItem = {
  label: "Overview", href: "/admin", icon: LayoutDashboard, exact: true, minRole: "admin",
  description: "Administration home — quick stats and shortcuts into every admin queue.",
};

// WORKSPACE — internal team tooling, its own top-level section. Marketing
// keeps campaign planning and production work together.
const workspaceVideoItem: NavItem = {
  label: "Video Production",
  href: "/admin/workspace/marketing/video",
  icon: Clapperboard,
  minRole: "admin",
  description:
    "Plan promo videos and draft their scripts. Scripts get shareable links for collaborative editing — contributors don't need an account.",
};

const workspaceGoogleAdsItem: NavItem = {
  label: "Google Ads",
  href: "/admin/workspace/marketing/google-ads",
  icon: Search,
  minRole: "admin",
  description:
    "Plan the English Search pilot across ENGAGE, EXPERIENCE and VentureConnect. Review campaign structure, conversion tracking, attribution and the approvals still required before launch.",
};

// WORKSPACE → 2026 Symposium → Comms Plan. Moved out of Marketing: the
// group is now organised by WHAT it is about rather than by which
// department does it, because the people running the symposium were
// visiting three different subgroups to do one job.
const workspaceSymposiumItem: NavItem = {
  label: "26 Symposium Comms Plan",
  href: "/admin/workspace/marketing/symposium",
  icon: CalendarClock,
  minRole: "admin",
  description:
    "The full communications & marketing playbook for the 2026 Annual Symposium and Training Week — editable Gantt timeline, pre/during/post promotion, sponsorship, sample report, and task breakdown. Shareable for collaborative editing.",
};

// WORKSPACE → Marketing → Sponsorship Package. The commercial half of the
// symposium, kept beside the Comms Plan: an editable offer doc with share
// links, so prospects get a URL rather than a PDF attachment.
const workspaceSponsorshipItem: NavItem = {
  label: "Sponsorship Package",
  href: "/admin/workspace/marketing/sponsorship",
  icon: Handshake,
  minRole: "admin",
  description:
    "The sponsorship offer for the Annual Symposium — why sponsor, event details, tier grid, and how to confirm. Editable in place, with shareable links for prospective sponsors.",
};

// WORKSPACE → 2026 Symposium → Merch. The trade-show giveaway shortlist.
// It sat under Marketing beside Sponsorship, which is true of how it is
// paid for and wrong about when it is used: it is one of the things you
// order for this event, so it belongs with the other things you order
// for this event — beside AV. Distinct from Operations → Merch
// fulfilment, which is the rewards vault trainees redeem credits
// against.
const workspaceMerchItem: NavItem = {
  label: "Merch",
  href: "/admin/workspace/merch",
  icon: Gift,
  minRole: "admin",
  description:
    "Trade-show giveaway shortlist — 25 items matched to real supplier products, grouped by tier, with cost estimates and a copy-ready quote request.",
};

// WORKSPACE → Marketing → Newsletter. Colleagues drop their section's
// update into ENGAGE / EXPERIENCE / EQUIP / EVENTS; the AI lays the issue
// out into the Mailchimp template and the editor copies the HTML across.
const workspaceNewsletterItem: NavItem = {
  label: "Newsletter",
  href: "/admin/workspace/marketing/newsletter",
  icon: Mail,
  minRole: "instructor",
  description:
    "Collect newsletter contributions from the team by section, then let the AI lay the issue out into the Mailchimp template — paste-ready HTML, no formatting rules for contributors.",
};

// WORKSPACE → Website Review. Its own subgroup, not under Marketing: the
// subject is the public website, not a campaign. Colleagues comment on a
// live page, threads resolve, and the open ones export as a brief for an
// AI coding agent.
const workspaceWebsiteReviewItem: NavItem = {
  label: "Website Review",
  href: "/admin/workspace/website-review",
  icon: MessageSquareText,
  minRole: "instructor",
  description:
    "Comment on any page of biohubnet.ca, reply to each other, resolve as fixes land — then export the open threads as a revision brief for Claude Code or Codex, anchored to the exact text on the page.",
};


// WORKSPACE -> Flow charts. Its own subgroup: a process diagram is not a
// campaign and not the website — it is how the team explains a workflow to
// itself. Seeded with the Training Week registration flow.
// The operational half of the same process: who gets a seat when a room
// is oversubscribed, how full each room is, and how to write to the
// people in it. Admin-only — Flow Charts is readable by instructors,
// this one changes who attends.
// Forms are their own thing now. The chart used to double as the form's
// definition, which meant a drawing could not be redrawn without
// changing what people were asked.
const workspaceFormsItem: NavItem = {
  label: "Forms",
  href: "/admin/workspace/forms",
  icon: ClipboardList,
  minRole: "admin",
  description:
    "Build a form — questions, logic, external data sheets — beside the workflow its answers run through.",
};

// WORKSPACE → Training Week → Registration Form. Its own route rather
// than a deep link into Process → Forms: that page opens whichever form
// was edited last, and the sidebar decides what is highlighted from the
// pathname, so a query string would light up two entries at once.
//
// The label stays short because the SUBGROUP says "Training Week".
// "Training Week Reg Form" measures 185px against the 169px the label
// column actually has, so it would have arrived truncated to "Training
// Week Re…" — the two words that matter cut off.
const workspaceTrainingFormItem: NavItem = {
  label: "Registration Form",
  href: "/admin/workspace/symposium-2026/registration",
  icon: ClipboardList,
  minRole: "admin",
  description:
    "What people fill in to register for Training Week — questions, logic, the session calendar — beside the workflow their answers run through.",
};

// WORKSPACE → 2026 Symposium → Logo Vote. Sixty candidate icons for the
// Luma registration page, three picks each. Open to instructors as well
// as admins — it is a house opinion, and a poll only three people can
// answer tells you about three people.
const workspaceLogoVoteItem: NavItem = {
  label: "Logo Vote",
  href: "/admin/workspace/symposium-2026/logo-vote",
  icon: Images,
  minRole: "instructor",
  description:
    "Vote on the icon for the Symposium's Luma registration page. Three picks each, results hidden until you have voted so nobody is anchored by the running total.",
};

// WORKSPACE → 2026 Symposium → Speakers. The same manager as
// Administration → Events → … → Speakers, on the group that owns the
// work: speaker details being filed under the events module is true and
// not something anybody should have to remember.
const workspaceSpeakersItem: NavItem = {
  // What it collects, not who it is about: the page exists to gather
  // headshots and bios, and "Speakers" alone read as a list of names.
  // 135px against the 169px available, so nothing truncates.
  label: "Headshots & Bios",
  href: "/admin/workspace/symposium-2026/speakers",
  icon: Mic,
  minRole: "admin",
  description:
    "Send invited speakers one link and they fill in their own headshot, bio, LinkedIn and what their session offers — no account needed. Review what comes back before it goes on the website.",
};

// WORKSPACE → 2026 Symposium → AV. Three Livecast documents compared:
// last year's quote, last year's actual invoice, and this year's quote.
// The invoice is in there because 2025 was billed 12% above its own
// quote — comparing 2026 against last year's estimate alone would say
// the price rose 47% when the honest figure is 31%.
const workspaceAvItem: NavItem = {
  label: "AV",
  href: "/admin/workspace/symposium-2026/av",
  icon: Speaker,
  minRole: "admin",
  description:
    "Livecast's 2026 quote against last year's quote and last year's final invoice — line by line, plus the terms that changed and the two that commit BHN to spending not in the quote.",
};

// WORKSPACE → Industry Insights. A different event on a different day,
// so its own subgroup rather than a fifth item under 2026 Symposium —
// filing it there would be the same mistake as speakers living under
// Events, one level down.
const workspaceInsightsSpeakersItem: NavItem = {
  // Same job, same label. Two identical features under two different
  // names is a worse inconsistency than renaming one the user did not
  // point at.
  label: "Headshots & Bios",
  href: "/admin/events/2026-industry-insights/speakers",
  icon: Mic,
  minRole: "admin",
  description:
    "Industry Insights, 24 September. Hand the invited hiring professionals one link and they fill in their own headshot, bio, LinkedIn and what their session will cover — no account needed.",
};

// WORKSPACE → Training Week → Dashboard. Flow Charts and the form
// builder are general tools; this one is only ever about this event —
// seats, rooms, who is coming and what they are told.
//
// "Admin Dashboard" said nothing about WHICH admin dashboard, sitting
// two rows under a form it is the dashboard FOR. Under the Training
// Week heading, directly beneath Registration Form, "Dashboard" is
// unambiguous and the pair reads as one thing.
const workspaceTrainingAdminItem: NavItem = {
  label: "Dashboard",
  href: "/admin/workspace/training-admin",
  icon: SlidersHorizontal,
  minRole: "admin",
  description:
    "Seats and capacity per workshop, the decision model behind who gets one, the registrant sheet, and the letters that go out at each stage.",
};

const workspaceFlowChartsItem: NavItem = {
  label: "Flow Charts",
  href: "/admin/workspace/flowcharts",
  icon: Workflow,
  minRole: "instructor",
  description:
    "Draw how a process runs — drag the boxes, connect them, rename anything. Opens on the Training Week registration flow.",
};

// WORKSPACE → Outreach. Sibling of Marketing and File Sharing. Two views:
// Contacts (the directory + lists) and Campaigns (tracked cross-promotion
// pushes), shown as sub-items under the Outreach subgroup.
const workspaceOutreachContactsItem: NavItem = {
  label: "Contacts",
  href: "/admin/workspace/outreach/contacts",
  icon: BookUser,
  minRole: "admin",
  description:
    "Partner contacts for cross-promoting BHN programs. One directory, many lists; editable columns; every contact records who added it.",
};
const workspaceOutreachCampaignsItem: NavItem = {
  label: "Campaigns",
  href: "/admin/workspace/outreach/campaigns",
  icon: Megaphone,
  minRole: "admin",
  description:
    "Run a tracked cross-promotion push: pick a target list and an email template, then work down a personalised roster, copying or opening each email and marking contacts reached.",
};


// ENGAGE — running the learning loop: enrolments, groups, course
// content, certificates, credits. Labels prefixed with "Manage" so
// admins can tell them apart from the equivalent trainee-facing
// items at a glance — both in the sidebar and in nav-history.
const adminEngageItems: NavItem[] = [
  { label: "Manage enrollments",        href: "/admin/enrollments",         icon: ClipboardList, minRole: "admin",
    description: "Overview of course + pathway enrollment health. Per-course and per-pathway stats, top items by enrollment, pending pathway requests. Sub-pages: course-enrollments list, new-enrollment workflow, pathway-enrollment queue." },
  { label: "Groups",                    href: "/admin/groups",              icon: UsersRound,   minRole: "admin",
    description: "User groups for batch-assigning courses or pathways. Useful for cohorts and corporate clients." },
  { label: "Credit applications",       href: "/admin/credit-applications", icon: CoinsIcon,    minRole: "admin",
    description: "Trainees applying for additional starter credits beyond the 200 default. Review and approve.",
    badgeKey: "credit-applications" },
  { label: "Manage pathway enrollments", href: "/admin/pathway-enrollments", icon: Layers,       minRole: "admin",
    description: "Enrollments into multi-course pathways. Approve gated pathways here.",
    badgeKey: "pathway-enrollments" },
  { label: "Course filters",            href: "/admin/course-filters",      icon: ListChecks,   minRole: "admin",
    description: "Topic and skill taxonomy that powers the catalog filter panel. Add, rename, retire." },
  { label: "Manage certificates",       href: "/admin/certificates",        icon: Award,        minRole: "admin",
    description: "Every issued certificate. Revoke a credential or look it up by SHA hash." },
  { label: "Cover art",                 href: "/admin/cover-art",           icon: Sparkles,     minRole: "admin",
    description: "AI-rendered cover art and colour overlays for every course and pathway. Bulk regenerate topic-specific thumbnails or stamp a shared gradient treatment across a series." },
  { label: "HQP Advisory Committee",    href: "/admin/committees/hqp",      icon: Users2,       minRole: "admin",
    description: "HQP Advisory Committee hub — applications, open-call windows, feedback rounds, meetings, and roster. ENGAGE-pillar committee that oversees trainee perspectives + course feedback." },
  { label: "Grad showcase",             href: "/admin/showcase",            icon: GraduationCap, minRole: "admin",
    description: "Public submissions from program graduates (name + LinkedIn + headshot) collected via /showcase/<program>. Download the photo, mark when processed, or delete spam. No login required on the public side." },
];

// OPERATIONS — running the day-to-day platform: fulfillment + the
// event calendar. Pulled out of ENGAGE (where they sat with the
// learning-loop tools) so admins can find ops work without scanning
// past enrolment + certificate management.
const adminOperationsItems: NavItem[] = [
  { label: "Access requests",           href: "/admin/access-requests",     icon: Inbox,        minRole: "admin",
    description: "Submissions from the public /for-employers and /for-trainees pages. Approve to mint an invite, or reject if it's not a fit. Surfaced previously through /admin/inbox + /admin/insights — now also a direct nav entry." },
  { label: "Merch fulfillment",         href: "/admin/merch",               icon: Gift,         minRole: "admin",
    description: "Reward bundles claimed by trainees. Pack pickups for the office; review mailing requests." },
  { label: "Events",                    href: "/admin/events",              icon: Calendar,     minRole: "admin",
    description: "BHN Annual Symposium & Training Week editions. Edit basics, manage registrations, run check-in. Workshops / sessions / speakers / sponsors are seeded for now." },
];

// EXPERIENCE — the matching marketplace: skill ontology that wires
// trainees to employers, plus everything employer-facing.
const adminExperienceItems: NavItem[] = [
  { label: "Skill ontology",      href: "/admin/skills",              icon: GitBranch,    minRole: "admin",
    description: "The skill graph wiring postings to candidates. Add aliases, merge duplicates, edit hierarchy." },
  { label: "AI matching engine",  href: "/admin/matching-config",     icon: Sliders,      minRole: "admin",
    description: "Tune the subscore weights, band thresholds, and cosine cutoffs that drive the fit scorer. Includes a live tester to preview impact on a real (trainee × posting) pair before saving." },
  { label: "Employer invites",    href: "/admin/employer-invites",    icon: Building2,    minRole: "admin",
    description: "Invite codes for new employer accounts. Generate, track open rate, revoke." },
  { label: "Demo workspaces",     href: "/admin/demo-workspaces",     icon: FlaskConical, minRole: "admin",
    description: "Time-limited demo workspaces for prospective partners. Auto-cleanup after expiry." },
  { label: "Showcase Trainee",    href: "/admin/showcases",           icon: Sparkles,     minRole: "admin",
    description: "Single global advanced-trainee demo account — completed coursework, both merch tiers earned, full profile, scheduled interviews. For sales calls and training-team demos." },
  { label: "Platform Demo Hub",  href: "/admin/demo",                icon: Drama,        minRole: "admin",
    description: "Interactive 3-persona walkthrough for senior management, investors, and board presentations. Rex (Trainee), Vera (Employer), and Max (Admin) each navigate ENGAGE · EXPERIENCE · EQUIP." },
  { label: "Sim requests",        href: "/admin/simulator-requests",  icon: Theater,      minRole: "admin",
    description: "User-submitted requests for role-play simulations. Review each JD, run the AI generator, hand-author a payload, or reject with a note." },
  { label: "Talent pool",         href: "/talent-pool",               icon: Users,        minRole: "admin",
    description: "Approved talent-application members — same surface employers see, with full submission data + comment threads. Use this to coordinate with employer reviewers." },
  { label: "Employer intake",     href: "/admin/experience/employer-intake", icon: Inbox, minRole: "admin",
    badgeKey: "employer-intake-new",
    description: "“Hire an intern” leads captured from the public form on biohubnet.ca (via /api/public/employer-intake) plus the imported Experience registry. Newest first, with CSV export." },
  // Visible to instructors + industrial mentors as well as admins —
  // reviewing trainee resumes is core mentor work, not an admin
  // privilege. The route itself re-checks isStaffReviewer(role).
  { label: "Trainee resumes",     href: "/mentor/trainees",           icon: FileText,     minRole: "instructor",
    description: "Open a trainee's structured resume, pin comments to specific bullets, and watch them adopt the suggestions. Read-only — the trainee owns what to apply." },
];

// EQUIP — the third pillar surface on the admin side. Was buried
// in Platform initially but it deserves its own group: three
// dedicated pages (overview / review queue / deadlines) that all
// belong to the funding workflow rather than platform plumbing.
const adminEquipItems: NavItem[] = [
  { label: "EQUIP overview",       href: "/admin/equip/overview",      icon: Activity,      minRole: "admin",
    description: "Program-management dashboard for the EQUIP pillar — apps in flight, approved this quarter, $ funded YTD, stalled-app alerts, per-stream funnel, open windows, recent activity. Renders in Studio." },
  { label: "EQUIP review",         href: "/admin/equip",               icon: Rocket,        minRole: "admin",
    description: "Review queue for the EQUIP funding pillar — VentureConnect (≤$5K) + VentureLift (≤$25K). Claim, approve / reject with a note + amount, mark funded. Mirrors the credit-applications shape." },
  { label: "Eligibility lists",    href: "/admin/eligibility",         icon: ShieldCheck,   minRole: "admin",
    description: "The programme lists Training Week registration is checked against. Someone not on a list is refused at the email question. Nothing is enforced until a list is imported, so load them before registration opens." },
  { label: "EQUIP email templates", href: "/admin/equip/email-templates", icon: Mail,        minRole: "admin",
    description: "Every email an EQUIP applicant can receive, for both streams — view, hand-edit, or AI-rewrite the copy. Sending itself always happens from the review page as an explicit reviewer action, never automatically." },
  { label: "EQUIP deadlines",      href: "/admin/equip/deadlines",     icon: ClipboardList, minRole: "admin",
    description: "Schedule + manage the funding-window deadlines for VentureConnect (monthly) and VentureLift (quarterly). List + calendar views. Open / close / extend any window. Late submissions are blocked automatically." },
  { label: "Recipient tracker",    href: "/admin/equip/tracker",       icon: Radar,         minRole: "admin",
    description: "Post-award intelligence dossier — every company funded by a VentureConnect or VentureLift grant, tracked across LinkedIn and the open web. Flags fresh raises, awards, partnerships and milestones, each linked to its source. Filter by track, search, or show highlights only." },
  { label: "EQUIP Review Committee", href: "/admin/committees/equip-review", icon: Users2, minRole: "admin",
    description: "Manage EQUIP Review Committee membership. Members get queue access without holding an admin role. Roster + a shortcut into the funding review queue." },
];

// INSIGHTS — was DESIGN & RESEARCH. Expanded with the analytics
// surfaces that previously lived in Platform (Analytics,
// Pipeline analytics, AutoPipette). The unifying lens: anything
// that *measures* the platform — UX charter outcomes, product
// engagement metrics, AI-assist effectiveness, generated
// reports. Design system is here too because picking it is a
// UX-research decision, not platform plumbing.
const adminInsightsItems: NavItem[] = [
  { label: "Design system",       href: "/admin/design-system",       icon: Palette,    minRole: "admin",
    description: "Pick the platform-wide layout vocabulary (Classic / Cinematic / Studio) — admin-only, applies to every user. Plus the live tokens reference: surfaces, type scale, radius scale, motion primitives, component patterns, accessibility checklist. Canonical doc at docs/design-system.md." },
  { label: "Design archive",      href: "/admin/design-archive",      icon: Layers,     minRole: "admin",
    description: "Working sketches and visual-language explorations — admin dashboard mockups (60 visual languages), per-language layout studies (Vintage IBM × 10, Y2K Aero × 50), and any future archives. Each is a static HTML file under public/design-archive/. Reference material when picking a direction for a new surface." },
  { label: "Login floaters",      href: "/admin/login-floaters",      icon: FlaskConical, minRole: "admin",
    description: "Manage the ambient process-glyph animations that sit on the dark periphery of the public /login screen. Adds + fine-tunes are driven from an interactive editorial gallery of the curated library; each card is the real React floater at thumbnail scale, so admins see exactly what will land on /login." },
  { label: "Insights",            href: "/admin/insights",            icon: Lightbulb,  minRole: "admin",
    description: "Per-period 'what users told us' synthesis. Read the signal feeds (theme votes, exit-survey responses, access requests, pending-queue heat), write the synthesis note, publish to /changelog so the loop closes back to users." },
  { label: "Experience metrics",  href: "/admin/experience-metrics",  icon: Gauge,      minRole: "admin",
    description: "UX-charter KPI dashboard. Tracks the three named user outcomes — trainee arrival latency, admin queue depth, transparency cadence — against the targets named in docs/ux/charter.md." },
  { label: "Analytics",           href: "/admin/analytics",           icon: LineChart,  minRole: "admin",
    description: "Engagement, learning, and conversion metrics across the platform." },
  { label: "AI metrics",          href: "/admin/ai-metrics",          icon: Activity,   minRole: "admin",
    description: "AI reliability + cost observability from the AIInteraction telemetry log — call volume, error rate, p50/p95 latency, cost, acceptance rate, and valid-output (schema-validation) rate, per day and per feature." },
  { label: "AI review queue",     href: "/admin/ai-review",           icon: ShieldCheck, minRole: "admin",
    description: "AI answers flagged for a human — thumbs-down from a learner or low-confidence (poorly grounded) answers, plus the triage agent's proposals. Resolve or escalate each." },
  { label: "AI triage agent",     href: "/admin/ai-agent",            icon: Sparkles,   minRole: "admin",
    description: "The autonomous agent that triages the AI review queue (category + severity + a proposed action for a human). Kill switch, run-now, before/after throughput vs manual triage, and run history. Orchestrated by Inngest." },
  { label: "Pipeline analytics",  href: "/admin/pipeline-analytics",  icon: Activity,   minRole: "admin",
    description: "Hiring-pipeline health — stage distribution, median time-in-stage, stalled (≥14d) applications, conversion-to-offer rate across the platform." },
  { label: "AutoPipette",         href: "/admin/assist",              icon: Pipette,    minRole: "admin",
    description: "Health, helpfulness, and findings for AutoPipette — BHN's AI lab partner that dispenses precise, single-dose help when learners look stuck. Per-card helpful rate, top stuck surfaces, latest weekly journey summaries, operator actions (run rollup / weekly summary / ad-hoc AI inference)." },
  { label: "Reports",             href: "/admin/reports",             icon: FileText,   minRole: "admin",
    description: "Generated reports for compliance, billing, and exec views." },
];

// SECURITY & COMPLIANCE — pulled out of Platform into its own
// dedicated group. The four items here all answer "is the
// platform safe + auditable + compliant?" — audit log for
// per-action history, Security for MFA + lockouts + e-sig
// config, Security policies for the governance docs, Compliance
// for the management overview against PIPEDA / AODA / etc.
const adminSecurityItems: NavItem[] = [
  { label: "Compliance",          href: "/admin/compliance",          icon: ShieldCheck, minRole: "admin",
    description: "Management overview — every framework BHN follows (PIPEDA, AODA, CASL, encryption, MFA, audit, RBAC, backups), what we actually do for each, and honest status. Five-minute readable." },
  { label: "Audit Log",           href: "/admin/audit",               icon: ShieldCheck, minRole: "admin",
    description: "Append-only log of admin actions. Required for SOC 2 and 21 CFR Part 11 attestation." },
  { label: "Security",            href: "/admin/security",            icon: ShieldCheck, minRole: "admin",
    description: "MFA enrollment, password policy, lockouts, e-signature configuration." },
  { label: "Security policies",   href: "/admin/security/policies",   icon: FileText,    minRole: "admin",
    description: "Every governance doc in one place — encryption posture, incident response, breach notification, sub-processors, ROPA, AUP, retention, pentest playbook. Reads from docs/security/ markdown so source-of-truth + rendered page can't drift." },
];

// SYSTEM — superadmin-only surfaces. Was bottom-of-Platform;
// pulled out so the gate is visually clear (these are the
// "tighten the screws on the whole platform" items, not
// day-to-day operations).
const adminSystemItems: NavItem[] = [
  { label: "LTI Config",          href: "/admin/lti",                 icon: Link2,       minRole: "superadmin",
    description: "LTI 1.3 launch configuration for external LMS integrations." },
  { label: "System status",       href: "/admin/system-status",       icon: Activity,    minRole: "superadmin",
    description: "Live system health — DB latency, queue depth, third-party API status." },
  { label: "Settings",            href: "/admin/settings",            icon: Settings,    minRole: "superadmin",
    description: "Platform-wide settings only superadmins can change." },
];

// PLATFORM — operating the platform itself: people, the inbox
// queue, comms / content, and feedback loops. Trimmed from the
// previous 24-item dumping ground. EQUIP / INSIGHTS / SECURITY /
// SYSTEM live in their own groups (above + below).
//
// Order intent — most-frequent first:
//   1. Inbox (catch-all queue, top of every admin shift)
//   2. People (Users, Role requests, Committees)
//   3. Comms / content (Announcements, Newsletter exports,
//      Editable copy)
//   4. Feedback loops (Theme proposals, Feedback)
//   5. Operations (Launch Readiness, Phantom users)
const adminPlatformItems: NavItem[] = [
  { label: "Roadmap",             href: "/roadmap",                   icon: Compass,     minRole: "superadmin",
    description: "Internal planning surface — Now / Next / Later horizons for the platform. Moved here from the user-side nav per request; the public-facing 'what shipped' view is /changelog." },
  { label: "Inbox",               href: "/admin/inbox",               icon: Inbox,       minRole: "admin",
    description: "Every pending admin request in one queue — credit apps, role changes, employer invites, mailing requests.",
    badgeKey: "inbox-total" },
  { label: "Users",               href: "/admin/users",               icon: Users,       minRole: "admin",
    description: "Every user on the platform. Search, filter, edit role / credits, deactivate." },
  { label: "Role requests",       href: "/admin/role-requests",       icon: UserCog,     minRole: "admin",
    description: "Trainees asking to upgrade their role (e.g. evaluating → trainee). Review and approve.",
    badgeKey: "role-requests" },
  // "Committees" used to live here as a single Platform entry that
  // mixed HQP + EQUIP Review management. Split out into pillar-
  // specific entries on user request — "HQP Advisory committee"
  // now sits under ENGAGE admin, "EQUIP Review committee" sits
  // under EQUIP admin, and the combined surface is gone.
  { label: "Announcements",       href: "/admin/announcements",       icon: Megaphone,   minRole: "admin",
    description: "Banner announcements shown across the platform. Schedule, target by role, set expiry." },
  { label: "Pages",               href: "/admin/pages",               icon: FileText,    minRole: "admin",
    description: "Lightweight CMS — publish announcements, policy pages, and standalone content to /p/[slug] without a code deploy. Markdown body, draft / publish status, audience gating." },
  { label: "Newsletter exports",  href: "/admin/newsletter",          icon: Mail,        minRole: "admin",
    description: "New newsletter opt-ins ready to export to BioHubNet's mailing list." },
  { label: "Editable copy",       href: "/admin/copy",                icon: FileText,    minRole: "admin",
    description: "Every editable page string in one place — change headlines, subtitles, hero copy. Live pages also have inline pencils." },
  { label: "Theme proposals",     href: "/admin/theme-proposals",     icon: Palette,     minRole: "admin",
    description: "Trainee-submitted theme ideas + aggregated vote totals. Review queue with one-click actions for review / build / ship / decline. Ship+bounty issues a tier-3 MerchReward.",
    badgeKey: "theme-proposals" },
  { label: "Feedback",            href: "/admin/feedback",            icon: MessageSquare, minRole: "admin",
    description: "Aggregated exit-survey responses from trainees leaving the talent pool — NPS, per-dimension ratings, reason breakdown, individual responses. Plus mint feedback-invitation links to send out of band." },
  { label: "Launch Readiness",    href: "/admin/launch-readiness",    icon: Rocket,      minRole: "admin",
    description: "Executive dashboard tracking go-live status — % ready, days to launch, decisions needed, top risks, detailed checklist by phase. Auto-detects what's done." },
  { label: "Phantom users",       href: "/admin/phantom-users",       icon: Ghost,       minRole: "admin",
    description: "Spawn throwaway test accounts for a day. Enroll them in courses, register them for events, exercise admin queues — they auto-delete when their TTL expires (hourly sweep)." },
];

/** Nav badgeKeys that should flip to the urgent rose chip the moment
 *  there's ≥1 pending — used for trainee-facing "someone's waiting on
 *  you" items where even one item shouldn't sit quietly in a brand-
 *  tone informational chip. */
/** Icon-name → component map for committee sidebar items. The
 *  registry stores icon names as plain strings so the registry
 *  itself stays tree-shakable; the actual lucide imports happen
 *  here in the Sidebar where they're already in the bundle. */
const COMMITTEE_ICONS: Record<CommitteeSidebarItem["icon"], typeof Rocket> = {
  Rocket,
  Users,
  Award,
  ClipboardList,
  Sparkles,
  Mail,
};

const URGENT_FROM_ONE = new Set<string>([
  "interview-requests",
  "offer-requests",
  "buddy-invites",
  "employer-intake-new",
]);

const ROLE_RANK: Record<string, number> = {
  user: 0,
  trainee: 0,
  evaluating: 0,
  // Industrial mentors are non-instructor staff who comment on
  // trainee work (resumes, interviews, STAR stories). Granted
  // instructor-tier rank so the staff-only nav items they need
  // (Trainee resumes, etc.) are visible. Per-page permission gates
  // are still the source of truth for what they can actually do.
  industrial_mentor: 1,
  instructor: 1,
  admin: 2,
  superadmin: 3,
};

interface SidebarProps {
  role: string;
  realRole?: string;
  actingAs?: string | null;
  user: { name?: string | null; email?: string | null; image?: string | null };
  credits?: number;
  /** Employer-only flag — when false (default), employers see only their portal. */
  allowPlatformContent?: boolean;
  /** Per-queue pending counts. Admin-side nav items with a matching
   *  `badgeKey` render a small count chip. Absent / 0 → no badge.
   *  See src/lib/admin/queue-counts.ts for the canonical key set. */
  queueCounts?: Record<string, number>;
  /** Active committee slugs the signed-in user belongs to. Resolved
   *  server-side in (dashboard)/layout.tsx so the sidebar can render
   *  a COMMITTEES section without an additional fetch. Empty array →
   *  no section rendered. */
  committees?: string[];
  /** Set of featureIds the viewing user has hidden via the
   *  /profile/preferences switchboard. Items in this set are filtered
   *  out of the sidebar before render. */
  hiddenFeatures?: Set<string>;
  /** Unread notification count — rendered as a badge on the bell icon
   *  in the logo header. Only meaningful for signed-in users with
   *  employer/hiring-team activity. */
  initialUnreadCount?: number;
}

/**
 * Bordered nav group with the title sitting at the top opening — the
 * fieldset/legend pattern. The title's background-color matches the
 * solid card so it visually "cuts" the border on whatever theme is
 * active.
 */
interface ProgramHint {
  title: string;
  body?: string;
}

/** Section colour tokens — see SectionGroup's `tone` prop. Each tone
 *  uses a fixed Tailwind palette (NOT theme-driven brand vars) so the
 *  ENGAGE / EXPERIENCE / ADMINISTRATION blocks read with the same
 *  identity colour on every theme. */
type SectionTone = "neutral" | "engage" | "experience" | "equip" | "electric" | "hr-preview";

interface ToneStyles {
  /** Outer container: border colour + faint wash + soft outer ring. */
  container: string;
  /** Title chip: bg + text + border + glow. */
  chip: string;
  /** Hover/focus colour bump for the chip. */
  hover: string;
}

// Section tone palettes — soft, same-family fills with darker text in
// the same family instead of saturated white-on-colour. Reads more
// like Notion / Linear / Stripe than a neon badge: less shouty, more
// refined ("柔和 + 高级感"), while still keeping ≥7:1 text contrast on
// the chip (AAA). Container border is the muted -200 of the same
// family so the section reads as one tonal block rather than three
// separate accents fighting each other.
const TONE_STYLES: Record<SectionTone, ToneStyles> = {
  neutral: {
    container: "border-line",
    chip:      "text-subtle bg-card-solid ring-1 ring-inset ring-line",
    hover:     "focus:text-fg hover:text-fg",
  },
  engage: {
    // Sage / jade — Engage = learn / practise / earn credits.
    container: "border-emerald-200/70 bg-emerald-50/25",
    chip:      "text-emerald-800 bg-emerald-100 ring-1 ring-inset ring-emerald-200/70 shadow-sm",
    hover:     "focus:bg-emerald-200 hover:bg-emerald-200 transition-colors",
  },
  experience: {
    // Muted gold — Experience = real-world / employer-facing surfaces.
    container: "border-amber-200/70 bg-amber-50/25",
    chip:      "text-amber-800 bg-amber-100 ring-1 ring-inset ring-amber-200/70 shadow-sm",
    hover:     "focus:bg-amber-200 hover:bg-amber-200 transition-colors",
  },
  equip: {
    // Rose / berry — Equip = commercialization funding. Sits as the
    // third pillar alongside Engage (emerald) and Experience (amber),
    // with a warmer, slightly aspirational hue that reads "funding
    // for what comes next" without competing for attention.
    container: "border-rose-200/70 bg-rose-50/25",
    chip:      "text-rose-800 bg-rose-100 ring-1 ring-inset ring-rose-200/70 shadow-sm",
    hover:     "focus:bg-rose-200 hover:bg-rose-200 transition-colors",
  },
  electric: {
    // Soft sky — Administration. Tinted just-enough-stronger than the
    // ENGAGE / EXPERIENCE sections so the privileged territory reads
    // more obviously as "you're now in admin land" without losing the
    // clean palette.
    container: "border-sky-300 bg-sky-100/60 ring-1 ring-inset ring-sky-200/60",
    chip:      "text-sky-900 bg-sky-200 ring-1 ring-inset ring-sky-300 shadow-sm",
    hover:     "focus:bg-sky-300 hover:bg-sky-300 transition-colors",
  },
  "hr-preview": {
    // Violet — superadmin "preview the HR seat" peek. Distinctively
    // brighter than the surrounding sections so the operator can spot
    // it instantly even when scanning a packed sidebar. Pairs with
    // the violet-tinted explainer + eye glyph the preview row uses.
    // eslint-disable-next-line no-restricted-syntax -- violet-specific halo for the role-preview ENGAGE container; designed to stay violet across all themes.
    container: "border-violet-300 bg-violet-100/55 ring-1 ring-inset ring-violet-200/70 shadow-[0_2px_12px_-6px_rgba(124,58,237,0.35)]",
    chip:      "text-violet-900 bg-violet-200 ring-1 ring-inset ring-violet-400 shadow-sm",
    hover:     "focus:bg-violet-300 hover:bg-violet-300 transition-colors",
  },
};

/** Per-section collapsed state, persisted in localStorage so the
 *  user's choice survives navigation + reloads. Keyed by section
 *  title — titles are stable for the lifetime of the section. */
const COLLAPSE_STORAGE_KEY = "bhn.sidebar.collapsed.v1";

function readCollapsed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(COLLAPSE_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((s): s is string => typeof s === "string"));
  } catch { return new Set(); }
}
function writeCollapsed(s: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify([...s]));
    // Notify other SectionGroup instances on the same page so a
    // click in one collapses just that one without forcing the
    // others to re-read. Minor — they each own their own state.
  } catch { /* quota / private-mode — silent, the collapse still works in-memory */ }
}

function SectionGroup({
  title, description, programs, children, tone = "neutral",
}: {
  title: string;
  description?: string;
  programs?: ProgramHint[];
  children: React.ReactNode;
  /** Visual emphasis for the section. Each tone uses a fixed Tailwind
   * palette (NOT theme-driven brand vars) so the sections stay
   * visually distinct across every theme — trainees navigating between
   * themes shouldn't lose their muscle memory of which color block
   * means which group of features.
   *   • engage     — emerald (learn / practise / earn)
   *   • experience — amber  (real-world / employer-facing)
   *   • electric   — sky    (administration / privileged territory)
   *   • hr-preview — violet (superadmin peek into the HR seat)
   *   • neutral    — line color, no tint (default fallback)
   */
  tone?: SectionTone;
}) {
  const hasTooltip = !!description || (programs && programs.length > 0);
  const toneStyles = TONE_STYLES[tone];

  // Collapse state — persisted in localStorage keyed by title.
  // Initialise via lazy initial to avoid hydration mismatch (SSR
  // can't read localStorage; the first client render syncs).
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(readCollapsed().has(title));
  }, [title]);
  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      const all = readCollapsed();
      if (next) all.add(title); else all.delete(title);
      writeCollapsed(all);
      return next;
    });
  }

  // Tooltip is positioned `fixed` (not `absolute`) so it escapes the
  // sidebar <nav>'s overflow-y-auto box, which would otherwise clip
  // anything that extends past the sidebar's right edge. We compute
  // the chip's screen-space coordinates on hover/focus and apply
  // `top` / `left` inline. Default position is off-screen so the
  // tooltip is never visible until a real position is computed.
  const chipRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  function placeTooltip() {
    if (!hasTooltip || !chipRef.current) return;
    const r = chipRef.current.getBoundingClientRect();
    setPos({ top: r.top, left: r.right });
  }

  // Keep the tooltip aligned if the user scrolls the sidebar (or page)
  // while it's visible. Listen on window with `capture` so we catch the
  // <nav>'s own scroll, then recompute against the chip's new rect.
  useEffect(() => {
    if (!pos) return;
    const onMove = () => placeTooltip();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos !== null]);

  return (
    <div
      // data-section-tone on the container too — paired with the
      // matching attribute on the chip, this lets dark themes
      // (Hi-tech, Nightfall) dim or re-tint the section wash
      // without touching Tailwind class lookups. See
      // [data-theme="hitech"] [data-section-tone="X"] rules in
      // globals.css.
      data-section-tone={tone}
      className={cn(
        "relative rounded-xl transition-[padding,border-color,background-color] duration-300 ease-out",
        // Two-mode layout:
        //   • EXPANDED — full bordered/painted container with the chip
        //     absolutely positioned to overlap the top border on the
        //     seam (the editorial "tab on a box" look). Tight margins.
        //   • COLLAPSED — chip renders IN FLOW inside the container
        //     (the absolute -top-[10px] overlap trick has nothing to
        //     overlap when there's no border, and made consecutive
        //     collapsed chips overlap each other by ~4 px because
        //     the chip extends 10 px above its container and the
        //     20-px margin-collapse between sections wasn't enough
        //     clearance for the chip's ~24-px height). Wider vertical
        //     margins (mt-3/mb-3) give the floating chips clear breathing
        //     room as the section is just a chip.
        collapsed
          ? "mt-3 mb-3 p-0 border border-transparent bg-transparent"
          : cn("mt-5 mb-2 border p-1.5 pt-3 space-y-0.5", toneStyles.container),
      )}
    >
      {/* Title chip — wrapped in a tiny hover-group that opens a tooltip
          to the right when there's content to show. The transparent pl-2
          padding bridges the gap so the cursor can travel into the
          tooltip without losing hover.

          Positioning differs by state:
            • EXPANDED → `absolute -top-[10px] left-5` so the chip
              overlaps the container's top border (the "tab on a box"
              editorial look). The chip's own opaque fill covers the
              border behind it.
            • COLLAPSED → `relative ml-5` so the chip flows normally
              inside the container, with proper vertical spacing
              against neighbouring collapsed sections. Without this
              flow positioning, the chip extends 10 px above its
              container and consecutive collapsed chips overlap. */}
      <div
        className={cn(
          "group/section z-20 px-1.5",
          collapsed
            ? "relative flex pl-5"
            : "absolute -top-[10px] left-5",
        )}
        onMouseEnter={hasTooltip ? placeTooltip : undefined}
        onFocus={hasTooltip ? placeTooltip : undefined}
      >
        {/* Unified chip + collapse toggle — one element does both.
            Clicking collapses/expands the section; the ChevronDown on
            the RIGHT gives the standard expand/collapse affordance
            without a separate floating button to the left. Tooltip
            still fires via the group/section wrapper above. */}
        <button
          ref={chipRef}
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
          aria-expanded={!collapsed}
          // data-section-tone exposes the tone to CSS so dark themes
          // (Hi-tech, Nightfall) can override chip bg/text/ring without
          // rewriting the Tailwind classes. See globals.css.
          data-section-tone={tone}
          className={cn(
            "px-2.5 py-1 text-xs font-medium uppercase tracking-[0.18em] rounded-md inline-flex items-center gap-1.5",
            toneStyles.chip,
            "cursor-pointer focus:outline-none",
            toneStyles.hover,
          )}
          aria-describedby={hasTooltip ? `${title}-tooltip` : undefined}
        >
          {title}
          <ChevronDown
            size={10}
            aria-hidden
            className={cn(
              "transition-transform duration-300 ease-out opacity-50",
              collapsed && "-rotate-90",
            )}
          />
        </button>
        {hasTooltip && (
          <div
            id={`${title}-tooltip`}
            role="tooltip"
            // position: fixed escapes the sidebar <nav>'s overflow box,
            // which previously clipped the tooltip past the sidebar's
            // right edge. Coordinates set inline via the chip's
            // getBoundingClientRect; default off-screen pre-hover.
            style={{
              position: "fixed",
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
            }}
            className="pl-3 w-72 z-50 invisible opacity-0 group-hover/section:visible group-hover/section:opacity-100 focus-within:visible focus-within:opacity-100 transition-opacity pointer-events-none group-hover/section:pointer-events-auto"
          >
            <div className="popover p-3 normal-case tracking-normal text-left">
              <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-subtle">{title}</p>
              {description && (
                <p className="text-sm text-fg leading-snug mt-1.5">{description}</p>
              )}
              {programs && programs.length > 0 && (
                <ul className="mt-3 space-y-2 border-t border-line pt-2.5">
                  {programs.map((p) => (
                    <li key={p.title}>
                      <p className="text-xs font-semibold text-fg leading-tight">{p.title}</p>
                      {p.body && <p className="text-xs text-muted leading-snug mt-0.5">{p.body}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
      {/* Collapse animation — the grid-rows trick.
       *
       *   • Wrapper is a 1-row grid. Its row size animates from
       *     `1fr` (expanded — sized to content) to `0fr` (collapsed
       *     — zero height) over the same duration as the chevron's
       *     rotation. Browsers interpolate grid-template-rows
       *     smoothly, so the children shrink in lockstep with the
       *     rotating glyph.
       *
       *   • The inner child has `overflow: hidden` + `min-h-0` so
       *     content gets clipped during the animation. Without
       *     min-h-0, a grid item can refuse to shrink below its
       *     content height and the animation skips.
       *
       *   • Opacity fades alongside so the last 60ms isn't an
       *     awkward "blink-out at 0 height". The combined feel is a
       *     soft accordion close that matches the rest of the
       *     platform's transitions (300ms, ease-out).
       *
       *   • `inert` + `aria-hidden` when collapsed so screen readers
       *     skip the hidden links and keyboard tab order doesn't
       *     land inside an invisible region. */}
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
          collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
        )}
        aria-hidden={collapsed}
        {...(collapsed ? { inert: "" as unknown as boolean } : {})}
      >
        <div className="overflow-hidden min-h-0">{children}</div>
      </div>
    </div>
  );
}

/** Tone for an admin sub-group — paired colours for the accent bar
 *  and the section heading text. Heading colour is the bar colour
 *  pushed two ramp-steps darker for better contrast on cream/white
 *  surfaces; the bar stays at signal-palette brightness so it reads
 *  as a coloured anchor.
 *
 *  Pillars map to the canonical platform signal palette: Engage =
 *  emerald, Experience = amber, Equip = sky, Insights = violet,
 *  Platform = cyan, Security = rose, System = slate. */
const ADMIN_SUBGROUP_TONES = {
  engage:     { bar: "#10b981", text: "#065f46" }, // emerald-500 / 800
  operations: { bar: "#14b8a6", text: "#115e59" }, // teal-500 / 800
  experience: { bar: "#f59e0b", text: "#92400e" }, // amber-500 / 800
  equip:      { bar: "#0ea5e9", text: "#075985" }, // sky-500 / 800
  insights:   { bar: "#8b5cf6", text: "#5b21b6" }, // violet-500 / 800
  platform:   { bar: "#0891b2", text: "#155e75" }, // cyan-600 / 800
  security:   { bar: "#f43f5e", text: "#9f1239" }, // rose-500 / 800
  system:     { bar: "#6b7280", text: "#374151" }, // slate-500 / 700
  symposium:  { bar: "#d946ef", text: "#86198f" }, // fuchsia-500 / 800
} as const;

type AdminSubgroupTone = (typeof ADMIN_SUBGROUP_TONES)[keyof typeof ADMIN_SUBGROUP_TONES];

/** Wrapper around an admin sub-group's heading + items. Renders a
 *  bolder, tone-coloured subheading on top followed by a thin
 *  coloured accent bar in the LEFT GUTTER of the sidebar (alongside
 *  the menu items — never alongside the heading).
 *
 *  Geometry (rev 2026-05-17d — multiline-safe):
 *    • Heading: 12 px / bold / 0.18 em tracking / tone-coloured.
 *    • Heading + bar are SIBLINGS inside the wrapper. The bar lives
 *      inside an inner `<div class="relative">` that starts AFTER
 *      the heading's box, so the bar's `top: 0` naturally lands at
 *      the first NavLink's top edge regardless of whether the
 *      heading wrapped onto one line ("Engage") or two lines
 *      ("Security & compliance"). Previous implementation used a
 *      fixed `top-[34px]` tuned for single-line headings — two-line
 *      headings shifted the items down but the bar stayed at 34 px
 *      and ended up alongside the heading text.
 *    • Bar sits at `left-0` of the inner container, which has no
 *      padding — so the bar lands at sidebar-x = 12 px, right in
 *      the middle of the visual gutter between the sidebar wall and
 *      the NavLink icons.
 *    • `z-10` keeps the bar above NavLink hover / active backgrounds.
 *    • Bar is `w-0.5` (2 px) to hold its weight against the bolder
 *      heading without feeling fussy. */
function AdminSubgroup({
  tone,
  label,
  children,
}: {
  tone: AdminSubgroupTone;
  label: string;
  children: React.ReactNode;
}) {
  // Collapse state — shares the same localStorage bucket as the top-
  // level sections so admins who collapse "Engage" once get a stable
  // sidebar across sessions. We prefix the key with "admin:" so the
  // top-level "Engage" pillar and the admin-side "Engage" subgroup
  // don't collide.
  const storageKey = `admin:${label}`;
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(readCollapsed().has(storageKey));
  }, [storageKey]);
  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      const all = readCollapsed();
      if (next) all.add(storageKey); else all.delete(storageKey);
      writeCollapsed(all);
      return next;
    });
  }
  return (
    <div className="mt-1 first:mt-0">
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={collapsed ? `Expand ${label}` : `Collapse ${label}`}
        aria-expanded={!collapsed}
        // text-left needed because <button> defaults to text-align:
        // center — wrapped labels (e.g. "SECURITY & COMPLIANCE")
        // were centring instead of staying flush-left with the
        // chevron.
        className="group w-full flex items-center gap-1.5 px-3 pt-3 pb-1.5 text-left text-[12px] uppercase tracking-[0.18em] font-bold select-none cursor-pointer hover:bg-fg/5 rounded transition-colors"
        style={{ color: tone.text }}
      >
        <span className="flex-1">{label}</span>
        <ChevronDown
          size={11}
          aria-hidden
          className={cn(
            "transition-transform duration-300 ease-out shrink-0 opacity-60 group-hover:opacity-100",
            collapsed && "-rotate-90",
          )}
        />
      </button>
      {/* Same grid-rows collapse trick as SectionGroup. */}
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
          collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
        )}
        aria-hidden={collapsed}
        {...(collapsed ? { inert: "" as unknown as boolean } : {})}
      >
        <div className="overflow-hidden min-h-0">
          <div className="relative">
            <span
              aria-hidden
              className="absolute left-0 top-0 bottom-1 w-0.5 rounded-full z-10 pointer-events-none"
              style={{ background: tone.bar }}
            />
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function NavLink({ item, pathname, onNavigate, queueCounts }: {
  item: NavItem;
  pathname: string;
  /** Optional callback fired on click — used by the mobile off-canvas
   *  variant to close the sheet after the user navigates. */
  onNavigate?: () => void;
  /** Per-queue pending counts. When `item.badgeKey` matches a key in
   *  this map and the count is > 0, a small chip renders to the right
   *  of the label. New "queue badge" design-system pattern (May 2026)
   *  — see docs/design-system.md and src/lib/admin/queue-counts.ts. */
  queueCounts?: Record<string, number>;
}) {
  const active = item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(item.href + "/");
  const Icon = item.icon;
  const hasTooltip = !!item.description;
  const badgeCount = item.badgeKey && queueCounts ? (queueCounts[item.badgeKey] ?? 0) : 0;
  const badgeText = badgeCount === 0 ? null : badgeCount > 99 ? "99+" : String(badgeCount);

  // Hover/focus tooltip plumbing. We use position: fixed so the
  // popover escapes the sidebar <nav>'s overflow-y-auto box (which
  // would otherwise clip anything past the right edge), and we
  // recompute the link's screen-space rect on scroll/resize while
  // the tooltip is visible. Hover has a 1.2 s warm-up — long enough
  // that the tooltip doesn't fire when the cursor merely passes
  // through, but short enough to feel responsive when someone
  // actually stops on a row. Keyboard focus is still instant
  // (assistive-tech users actively chose to land here).
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function place() {
    if (!linkRef.current) return;
    const r = linkRef.current.getBoundingClientRect();
    setPos({ top: r.top, left: r.right });
  }
  function showSoon() {
    if (!hasTooltip) return;
    if (showTimer.current) clearTimeout(showTimer.current);
    showTimer.current = setTimeout(place, 1200);
  }
  function showNow() {
    if (!hasTooltip) return;
    if (showTimer.current) clearTimeout(showTimer.current);
    place();
  }
  function hide() {
    if (showTimer.current) clearTimeout(showTimer.current);
    showTimer.current = null;
    setPos(null);
  }
  // Cleanup pending timer on unmount.
  useEffect(() => () => { if (showTimer.current) clearTimeout(showTimer.current); }, []);
  // Reposition while visible — sidebar may scroll independently of the page.
  useEffect(() => {
    if (!pos) return;
    const onMove = () => place();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [pos !== null]);

  // Route-change cleanup. Without this, the classic "stuck tooltip"
  // bug fires: click a link → Next.js client-navigates with no
  // movement of the cursor → new page renders under the stationary
  // pointer → browser never emits a mouseleave because no movement
  // occurred → state stays set → tooltip lingers. Forcing hide() on
  // every pathname change makes it impossible for a tooltip to
  // survive a navigation.
  useEffect(() => {
    hide();
    // hide() is stable enough for this — the next render uses the
    // closed-over instance and we don't want a re-attach loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // External-highlight listener — guide pages dispatch
  // `bhn:nav-highlight` events with an href payload when the reader
  // hovers a nav mention. The matching nav row lights up so the
  // reader can find the corresponding control in the menu without
  // hunting. Empty href clears the highlight.
  const [externalHighlight, setExternalHighlight] = useState(false);
  useEffect(() => {
    function onHl(e: Event) {
      const detail = (e as CustomEvent<{ href: string | null }>).detail;
      setExternalHighlight(detail?.href === item.href);
    }
    window.addEventListener("bhn:nav-highlight", onHl as EventListener);
    return () => window.removeEventListener("bhn:nav-highlight", onHl as EventListener);
  }, [item.href]);

  const tooltipId = `navtip-${item.href.replace(/[^a-z0-9]/gi, "_")}`;
  // Stable data-attribute selector for the NavHighlightOverlay so a
  // guide-page pill can locate "the sidebar copy of this href" even
  // when the same href appears elsewhere on the page (e.g. inside a
  // <NavHighlight> pill that the user is hovering).
  const navDataAttr = item.href;

  return (
    <>
      <Link
        ref={linkRef}
        href={item.href}
        data-sidebar-nav-href={navDataAttr}
        onClick={() => { hide(); onNavigate?.(); }}
        onMouseEnter={showSoon}
        onMouseLeave={hide}
        // pointerleave is the modern pointer-events equivalent; some
        // hybrid (mouse-plus-touch) browsers fire one but not the
        // other, so we listen for both as a belt-and-suspenders.
        onPointerLeave={hide}
        onFocus={showNow}
        onBlur={hide}
        aria-current={active ? "page" : undefined}
        aria-describedby={hasTooltip ? tooltipId : undefined}
        className={cn(
          "relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
          // focus-visible adds an explicit ring for keyboard users; the
          // ring is brand-tinted and offset so it floats just outside
          // the rounded link box, looking deliberate rather than tacked-on.
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-1 focus-visible:ring-offset-card",
          active
            ? "bg-brand-50 text-brand-700"
            : "text-muted hover:bg-raised hover:text-fg",
          // External highlight — when a guide-page NavHighlight pill
          // is hovered, the matching nav row lights up with a brand
          // ring + amber-ish flash so the reader can locate the
          // mentioned control at a glance.
          externalHighlight && "ring-2 ring-amber-400 bg-amber-50 text-amber-900 shadow-amber-pulse animate-pulse",
        )}
      >
        {/* Theme-independent active accent — a 2px left edge in brand-600.
            Gives the active state a strong visual anchor even when the
            theme's brand-50 fill blends with the page background (Mist,
            Sakura) or shouts louder than expected (Hi-Tech). */}
        {active && (
          <span
            aria-hidden
            className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-brand-600"
          />
        )}
        <Icon size={16} className="shrink-0" />
        <span className="flex-1 truncate">{item.label}</span>
        {/* Queue badge — only renders when the nav item has a
            badgeKey AND its count is > 0. We never render "0" because
            the absence of a chip already means "nothing pending".
            Tone scales with severity:
              • urgent-from-one keys (interview / offer / buddy
                invites — trainee-side, time-sensitive) → rose chip
                with a soft pulse on every count ≥ 1.
              • everything else → brand fill ≤ 5, rose ≥ 6
                (the original admin-queue threshold).
            Capped at 99+ for visual stability. */}
        {badgeText && (() => {
          const urgentFromOne = item.badgeKey ? URGENT_FROM_ONE.has(item.badgeKey) : false;
          const isUrgent = urgentFromOne || badgeCount >= 6;
          return (
            <span
              className={cn(
                "shrink-0 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-[10px] font-bold tabular-nums",
                isUrgent
                  ? "bg-rose-600 text-white animate-nav-badge-pulse"
                  : "bg-brand-100 text-brand-800 ring-1 ring-inset ring-brand-200",
              )}
              aria-label={`${badgeCount} pending`}
            >
              {badgeText}
            </span>
          );
        })()}
        {active && <ChevronRight size={14} className="text-brand-400 shrink-0" />}
      </Link>

      {/* Hover/focus tooltip. Hidden under md — on mobile the drawer
          is too narrow for a sidebar-anchored popover and users tap to
          navigate anyway. `pointer-events-none` ensures the tooltip
          doesn't itself swallow hover state when it overlaps the link. */}
      {hasTooltip && pos && (
        <div
          id={tooltipId}
          role="tooltip"
          className="hidden md:block fixed z-[60] w-72 popover p-3 pointer-events-none animate-fade-in"
          style={{ top: pos.top, left: pos.left, marginLeft: 8 }}
        >
          <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-subtle">
            {item.label}
          </p>
          <p className="text-xs text-fg leading-snug mt-1">{item.description}</p>
        </div>
      )}
    </>
  );
}

const SIDEBAR_COLLAPSED_KEY = "bhn-sidebar-collapsed";

/**
 * The collapsed flag lives in localStorage, so it is external state and is
 * read as such rather than copied into React with an effect.
 *
 * useSyncExternalStore gets three things for the same code: no setState in
 * an effect, a server snapshot (always expanded) that keeps the server and
 * client markup identical, and cross-tab sync through the `storage` event
 * for nothing.
 */
const collapseListeners = new Set<() => void>();

function subscribeRailCollapsed(onChange: () => void) {
  collapseListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    collapseListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readRailCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false; // private mode — just stay open
  }
}

function writeRailCollapsed(next: boolean) {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
  } catch { /* not fatal — the toggle still works for this page */ }
  // `storage` only fires in OTHER tabs, so this tab is told directly.
  collapseListeners.forEach((fn) => fn());
}

export function Sidebar({
  role, realRole, actingAs, user, credits, allowPlatformContent = false,
  queueCounts,
  committees = [],
  hiddenFeatures,
  initialUnreadCount = 0,
}: SidebarProps) {
  // Helper used wherever the sidebar iterates an item list — drops
  // items the user has hidden via /profile/preferences. When the
  // prop is absent (legacy renders, tests, etc.) nothing is filtered.
  const visibleByPrefs = <T extends { featureId?: string }>(items: T[]): T[] =>
    hiddenFeatures && hiddenFeatures.size > 0
      ? items.filter((i) => !i.featureId || !hiddenFeatures.has(i.featureId))
      : items;
  const pathname = usePathname();
  const t = useT();
  // Effective role for visibility gating. When a superadmin is acting
  // as another role via RoleSwitcher (`actingAs`), the sidebar should
  // only show what the acted-as role can see — otherwise "act as
  // trainee" still surfaces all the admin links and the simulation is
  // meaningless. ImpersonationBanner stays visible so the user knows
  // they can switch back.
  const effectiveRole = actingAs ?? role;
  const userRank = ROLE_RANK[effectiveRole] ?? 0;
  const isAdmin = userRank >= ROLE_RANK["admin"];
  const isStaff = userRank >= ROLE_RANK["instructor"];
  const isEmployer = effectiveRole === "employer";
  // Employer accounts only see ENGAGE / EXPERIENCE / Buddies if an
  // admin has flipped allowPlatformContent on for them.
  const showLearnerNav = !isEmployer || allowPlatformContent;

  // Mobile off-canvas drawer. The shell renders on every viewport;
  // <md the desktop shell collapses behind a hamburger. State lives
  // here rather than in the parent layout so the rest of the page
  // doesn't need to know about the toggle.
  const [mobileOpen, setMobileOpen] = useState(false);
  /**
   * Desktop only: fold the whole rail away and leave just the button.
   *
   * Not an icon rail. A page like Flow Charts wants every pixel of width,
   * and a 64px strip of icons still costs the width while being harder to
   * read than the full menu — so collapsing hides the nav outright and
   * leaves one control to bring it back.
   *
   * Persisted, because a preference that resets on every reload is not a
   * preference. The server snapshot is always "expanded", so the first
   * paint matches the server and a collapsed rail folds on hydration.
   */
  const collapsed = useSyncExternalStore(subscribeRailCollapsed, readRailCollapsed, () => false);
  const toggleCollapsed = () => writeRailCollapsed(!collapsed);

  /**
   * Mirror the state onto <html> so plain CSS can respond to it.
   *
   * A page cannot widen the layout container it renders inside from React
   * — the container is an ancestor, and a server component at that. An
   * attribute on the root plus one `:has()` rule lets a page opt into the
   * width the collapsed rail just freed, with no context and no prop
   * threaded through the layout.
   */
  useEffect(() => {
    document.documentElement.dataset.rail = collapsed ? "collapsed" : "open";
  }, [collapsed]);
  // Close drawer on route change so the next page isn't covered.
  useEffect(() => { setMobileOpen(false); }, [pathname]);
  // Body scroll-lock while the drawer is open.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);
  // Esc to close.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const filterByRole = (item: NavItem) => {
    const required = ROLE_RANK[item.minRole ?? "admin"] ?? ROLE_RANK.admin;
    return userRank >= required;
  };
  const visibleEngageAdmin     = adminEngageItems.filter(filterByRole);
  const visibleOperationsAdmin = adminOperationsItems.filter(filterByRole);
  const visibleExperienceAdmin = adminExperienceItems.filter(filterByRole);
  const visibleEquipAdmin      = adminEquipItems.filter(filterByRole);
  const visibleInsightsAdmin   = adminInsightsItems.filter(filterByRole);
  const visiblePlatformAdmin   = adminPlatformItems.filter(filterByRole);
  const visibleSecurityAdmin   = adminSecurityItems.filter(filterByRole);
  const visibleSystemAdmin     = adminSystemItems.filter(filterByRole);
  // Committee memberships → registry meta. Drops slugs the registry
  // no longer knows about (e.g. a column value left over from a
  // retired committee). Empty list → no COMMITTEES section rendered.
  const rawVisibleCommittees = COMMITTEES.filter((c) => committees.includes(c.slug));

  // COMMITTEES sidebar items pointing at admin routes (e.g. the
  // EQUIP Review committee's shortcuts at /admin/equip/*) should
  // never render in this section, regardless of who's viewing:
  //   • Admins already see those routes under Administration → EQUIP,
  //     so showing them again under COMMITTEES is a duplicate.
  //   • Non-admins can't access admin routes anyway — surfacing a
  //     link they'll 403 on is worse than hiding it.
  // We build the deduplication set from EVERY admin item (not just
  // the ones the current user can see), so the filter applies
  // identically to admins and non-admins.
  const allAdminHrefs = new Set<string>([
    adminOverview.href,
    ...adminEngageItems.map((i) => i.href),
    ...adminOperationsItems.map((i) => i.href),
    ...adminExperienceItems.map((i) => i.href),
    ...adminEquipItems.map((i) => i.href),
    ...adminInsightsItems.map((i) => i.href),
    ...adminPlatformItems.map((i) => i.href),
    ...adminSecurityItems.map((i) => i.href),
    ...adminSystemItems.map((i) => i.href),
  ]);
  const visibleCommittees = rawVisibleCommittees
    .map((c) => ({
      ...c,
      sidebarItems: c.sidebarItems.filter((s) => !allAdminHrefs.has(s.href)),
    }))
    .filter((c) => c.sidebarItems.length > 0);

  // Role-based inline pillar links. The `engage_hqp_advisor` role
  // (rank-1 reviewer seat) gets an "ENGAGE HQP advisory" shortcut
  // rendered inline at the bottom of the ENGAGE pillar section
  // below, instead of in the standalone COMMITTEES block. Role-
  // based rather than committee-based because the committee entry
  // was collapsed into a first-class role on user request.
  const isEngageHqpAdvisor =
    role === "engage_hqp_advisor" || realRole === "engage_hqp_advisor";
  // HR-view preview — surfaces the exact employer-portal nav (same
  // routes the EMPLOYER PORTAL section would render at the top of
  // the sidebar for a real employer) inside the Administration
  // section so superadmins can peek at the HR mental model without
  // role-switching first.
  //
  // Gating:
  //   • realRole === "superadmin"  — only actual superadmins.
  //     Admins see less than full HR, so they shouldn't claim the
  //     preview either.
  //   • !actingAs                  — when the superadmin uses the
  //     RoleSwitcher to "view as" a lower role, the whole point is
  //     to see what that role sees. The HR PREVIEW block isn't part
  //     of any lower role's sidebar, so it must hide too — otherwise
  //     a superadmin acting-as-trainee sees an HR menu the actual
  //     trainee never would.
  const showHrViewPreview = realRole === "superadmin" && !actingAs;

  return (
    <>
      {/* Mobile hamburger — fixed to the top-left of the viewport when
          the off-canvas drawer is closed. <md only; desktop shell
          (<aside> below) is hidden under md. The button itself sits at
          z-50 so it floats above page content. */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
        aria-expanded={mobileOpen}
        className="md:hidden fixed top-3 left-3 z-50 inline-flex items-center justify-center w-10 h-10 rounded-xl bg-card border border-line shadow-md text-fg hover:bg-elevated"
      >
        <Menu size={18} />
      </button>

      {/* The one thing left after collapsing. Mirrors the mobile
          hamburger's position so the "open the menu" control is in the
          same place at every width. */}
      {collapsed && (
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label="Show menu"
          aria-expanded={false}
          title="Show menu"
          className="hidden md:inline-flex fixed top-3 left-3 z-50 items-center justify-center w-10 h-10 rounded-xl bg-card border border-line shadow-md text-muted hover:bg-elevated hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
        >
          <PanelLeftOpen size={18} />
        </button>
      )}

      {/* Backdrop for mobile drawer. Pointer-events disabled when
          closed so it doesn't intercept clicks. */}
      <div
        onClick={() => setMobileOpen(false)}
        aria-hidden
        className={cn(
          "md:hidden fixed inset-0 z-40 bg-backdrop transition-opacity",
          mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
      />

      <nav
        aria-label="Main navigation"
        className={cn(
          // Desktop: static, w-64. Mobile: fixed-position drawer that
          // slides in from the left. The same DOM serves both — no
          // duplicated nav lists to keep in sync.
          "glass border-r border-line flex flex-col z-50",
          "md:relative md:w-64 md:translate-x-0",
          "fixed top-0 bottom-0 left-0 w-72 max-w-[85vw] transition-transform duration-200 ease-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          // Collapsed is a desktop state; the drawer still opens on mobile.
          collapsed && "md:hidden",
        )}
      >
        {/* Mobile-only close button inside the drawer header. */}
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
          className="md:hidden absolute top-3 right-3 z-10 inline-flex items-center justify-center w-9 h-9 rounded-xl text-muted hover:bg-elevated hover:text-fg"
        >
          <X size={16} />
        </button>

        {/* Logo */}
        <div className="px-4 py-4 border-b border-line flex items-center gap-2">
          <Link href="/dashboard" className="flex items-center gap-3 flex-1 min-w-0 hover:bg-elevated/50 rounded-lg px-2 py-1 transition-colors">
            <LogoMark size={36} className="drop-shadow-sm shrink-0" />
            <div className="leading-tight min-w-0">
              <p className="font-bold text-fg text-sm">BHN <span className="text-brand-600 font-semibold">Training</span></p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-subtle mt-0.5">{effectiveRole}</p>
            </div>
          </Link>
          <NotificationBell initialUnreadCount={initialUnreadCount} />
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Hide menu"
            aria-expanded
            title="Hide menu"
            className="hidden md:inline-flex items-center justify-center w-8 h-8 shrink-0 rounded-lg text-muted hover:bg-elevated hover:text-fg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
          >
            <PanelLeftClose size={16} />
          </button>
        </div>

        {/* Global admin search — lives here (not on a single page) so
            it's reachable from anywhere in the app, not just the Admin
            Dashboard. Gated to admin/superadmin since the API route
            itself requires that role. */}
        {isAdmin && (
          <div className="px-3 pt-3 pb-3 border-b border-line">
            <AdminGlobalSearch />
          </div>
        )}

      <nav data-sidebar-nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {/* Dashboard is the standard learner home. Employers don't
            have a separate "Dashboard" surface anymore — their
            canonical entry is the EMPLOYER PORTAL → Overview
            below, which carries the brand-stage wavy banner +
            identity row + action queue. Hiding the Dashboard link
            for employers keeps the sidebar honest (no link → a
            page that just redirects them back out). */}
        {!isEmployer && (
          <NavLink item={{ ...dashboardItem, label: t(dashboardItem.labelKey) }} pathname={pathname} onNavigate={() => setMobileOpen(false)} queueCounts={queueCounts} />
        )}

        {isEmployer && (
          <SectionGroup
            title="EMPLOYER PORTAL"
            description="Hiring side: company profile, postings you've published, and the candidates who applied."
          >
            {employerItems.map((item) => (
              <NavLink key={item.href} item={{ ...item, label: t(item.labelKey) }} pathname={pathname} onNavigate={() => setMobileOpen(false)} queueCounts={queueCounts} />
            ))}
          </SectionGroup>
        )}

        {showLearnerNav && (
          <SectionGroup
            title="ENGAGE"
            tone="engage"
            description="Industry-led training, workshops, and mentorship."
            programs={[
              {
                title: "Medical Affairs Learning Pathway",
                body: "MSL Accelerator with Agilis Health — 2-day intensive in Toronto. Cohort runs in spring; next group in Fall.",
              },
              {
                title: "Entrepreneurship Learning Pathway",
                body: "Programme for life-sciences founders and aspiring founders.",
              },
            ]}
          >
            {visibleByPrefs(engageItems).map((item) => {
              const labeled = { ...item, label: t(item.labelKey) };
              return <NavLink key={item.href} item={labeled} pathname={pathname} onNavigate={() => setMobileOpen(false)} queueCounts={queueCounts} />;
            })}
            {/* ENGAGE HQP Advisory shortcut — renders inline under
                the ENGAGE pillar section instead of in a standalone
                COMMITTEES block, per user request. Visible only for
                users in the `engage_hqp_advisor` role seat. */}
            {isEngageHqpAdvisor && (
              <NavLink
                item={{
                  label: "ENGAGE HQP advisory",
                  href: "/committee/hqp",
                  icon: Award,
                  description: "ENGAGE-pillar HQP advisory dashboard — training-side perspectives, course quality, learner feedback.",
                }}
                pathname={pathname}
                onNavigate={() => setMobileOpen(false)}
                queueCounts={queueCounts}
              />
            )}
          </SectionGroup>
        )}

        {showLearnerNav && experienceItems.length > 0 && (
          <SectionGroup
            title="EXPERIENCE"
            tone="experience"
            description="Bridging theory and practice through experiential learning."
            programs={[
              {
                title: "My Application",
                body: "Resume, 1-minute video, and elevator pitch — built once, reused by every form you submit.",
              },
              {
                title: "Knowledge Exchange — Round 4",
                body: "Industry placements running 1, 4, or 6 months. Application deadline 29 May 2026.",
              },
              {
                title: "Talent Application",
                body: "Submit your bio, supervisor letter, transcript, resume, and STAR video — we share with vetted partners.",
              },
              {
                title: "Internships",
                body: "Live job board of internship and co-op postings from BHN industry partners.",
              },
            ]}
          >
            {visibleByPrefs(experienceItems).map((item) => {
              const labeled = { ...item, label: t(item.labelKey) };
              return <NavLink key={item.href} item={labeled} pathname={pathname} onNavigate={() => setMobileOpen(false)} queueCounts={queueCounts} />;
            })}
          </SectionGroup>
        )}

        {showLearnerNav && equipItems.length > 0 && (
          <SectionGroup
            title="EQUIP"
            tone="equip"
            description="Funding for trainee-entrepreneurs commercializing biomanufacturing innovations."
            programs={[
              {
                title: "VentureConnect — up to $5,000",
                body: "Conferences, demo days, pitch competitions. Monthly funding cycle.",
              },
              {
                title: "VentureLift — up to $25,000",
                body: "Accelerator participation, IP filings, prototype builds, commercialization roadmap. Quarterly cycle.",
              },
              {
                title: "Innovation Fellowship",
                body: "Apply through the dedicated online workflow and submit the required supporting documents.",
              },
            ]}
          >
            {/* Admin+ always see the EQUIP learner section regardless of
                their per-user preferences. The registry has both equip
                learner items (`equip-funding`, `equip-tracker`) at
                `defaultEnabled: false` because most trainees don't apply
                for funding — but admins need the menu to navigate the
                trainee-side funding surfaces (review queues, deadlines
                management, application context for the review pillar)
                without having to flip individual toggles in
                /profile/preferences first.
                Non-admin roles keep the preference-respecting
                `visibleByPrefs(equipItems)` behaviour. */}
            {(isAdmin ? equipItems : visibleByPrefs(equipItems)).map((item) => {
              const labeled = { ...item, label: t(item.labelKey) };
              return <NavLink key={item.href} item={labeled} pathname={pathname} onNavigate={() => setMobileOpen(false)} queueCounts={queueCounts} />;
            })}
            <NavLink item={innovationFellowshipItem} pathname={pathname} onNavigate={() => setMobileOpen(false)} queueCounts={queueCounts} />
            <NavLink item={ventureConnectDirectItem} pathname={pathname} onNavigate={() => setMobileOpen(false)} queueCounts={queueCounts} />
            {effectiveRole === "superadmin" && (
              <NavLink item={equipAdminDashboardItem} pathname={pathname} onNavigate={() => setMobileOpen(false)} queueCounts={queueCounts} />
            )}
          </SectionGroup>
        )}

        {/* COMMITTEES — only rendered when the user belongs to ≥1
            committee. Listed under their own section so committee
            members spot the shortcut immediately on first paint;
            primary roles still see ENGAGE / EXPERIENCE / EQUIP /
            ADMINISTRATION as before. */}
        {visibleCommittees.length > 0 && (
          <SectionGroup
            title="COMMITTEES"
            description="Your committee surfaces. Equip Review members can claim + decide on funding apps; HQP members coordinate via the HQP dashboard."
          >
            {visibleCommittees.flatMap((c) =>
              c.sidebarItems.map((s: CommitteeSidebarItem) => {
                const Icon = COMMITTEE_ICONS[s.icon] ?? Sparkles;
                // No minRole — visibility is gated by the
                // visibleCommittees filter above (only renders when
                // the user belongs to ≥1 committee), so the per-
                // link role check would be redundant.
                const item: NavItem = {
                  label: s.label,
                  href: s.href,
                  icon: Icon,
                  description: c.description,
                };
                return (
                  <NavLink
                    key={`${c.slug}-${s.href}`}
                    item={item}
                    pathname={pathname}
                    onNavigate={() => setMobileOpen(false)}
                    queueCounts={queueCounts}
                  />
                );
              }),
            )}
          </SectionGroup>
        )}

        {showHrViewPreview && !isEmployer && (
          <SectionGroup
            title="HR PREVIEW"
            description="What an HR account sees in their menu. Click any link to preview the route; use the xx keyboard shortcut to view-as HR with the act-as cookie set."
            tone="hr-preview"
          >
            {/* Lifted out of the Admin section so the HR surface
                reads as a peer of ENGAGE / EXPERIENCE rather than
                buried under Administration. Gated on superadmin
                (showHrViewPreview) AND not currently acting as
                employer — the top-of-nav EMPLOYER PORTAL block
                already covers that case and we don't want to
                render the same six links twice.

                Visual treatment: violet "hr-preview" tone — distinctly
                brighter than the surrounding sections so a superadmin
                spots it instantly when scanning the sidebar. Pairs
                with the Eye glyph + violet-tinted explainer below. */}
            <p className="px-3 -mt-0.5 pb-1.5 text-[11px] text-violet-800 leading-snug inline-flex items-start gap-1.5">
              <Eye size={11} className="text-violet-700 mt-0.5 shrink-0" />
              <span>
                Preview only · use{" "}
                <code className="font-mono text-violet-900 bg-violet-50 ring-1 ring-inset ring-violet-200 px-1 rounded">xx</code>{" "}
                to view-as HR
              </span>
            </p>
            {employerItems.map((item) => (
              <NavLink
                key={item.href}
                item={{ ...item, label: t(item.labelKey) }}
                pathname={pathname}
                onNavigate={() => setMobileOpen(false)}
                queueCounts={queueCounts}
              />
            ))}
          </SectionGroup>
        )}

        {showLearnerNav && (
          <>
            <div className="pt-2" />
            {visibleByPrefs(miscItems)
              // miscItems default to trainee-visible unless an explicit
              // `minRole` is set (e.g. roadmap is superadmin-only). The
              // shared filterByRole helper assumes admin-default for
              // admin-zone items, which is the wrong default here.
              .filter((item) => {
                const required = ROLE_RANK[item.minRole ?? "trainee"] ?? 0;
                return userRank >= required;
              })
              .map((item) => {
                // Trainees see the changelog as "What's new"; staff as "Changelog".
                const key = item.href === "/changelog" && !isStaff ? "nav.changelogTrainee" : item.labelKey;
                const labeled = { ...item, label: t(key) };
                return <NavLink key={item.href} item={labeled} pathname={pathname} onNavigate={() => setMobileOpen(false)} queueCounts={queueCounts} />;
              })}
          </>
        )}

        {/* MY PROFILE retired — the avatar at the bottom-left of
            the sidebar already routes to /profile, so this section
            was duplicated affordance. The /profile route still
            works (Feature switcher board lives there). */}

        {isAdmin && (
          <SectionGroup
            title="WORKSPACE"
            tone="neutral"
            description="Internal team tooling for campaigns, content, events, website review and operational planning."
          >
            {/* Grouped by the THING, not by the department. Running the
                symposium meant visiting Marketing for the plan and
                Process for the form and the seats — three subgroups for
                one job, none of which was about the symposium. */}
            {/* Training Week (26–28 Oct) before the Symposium (29 Oct) —
                chronological, and its own subgroup for the reason
                Industry Insights has one: a different event on
                different days. The form and the dashboard that runs it
                were filed under "2026 Symposium", where "Registration
                Form" did not say which registration and "Admin
                Dashboard" did not say which admin. Under this heading
                they are a pair and neither label has to carry the
                event's name. */}
            <AdminSubgroup tone={ADMIN_SUBGROUP_TONES.experience} label="Training Week">
              <NavLink item={workspaceTrainingFormItem} pathname={pathname} onNavigate={() => setMobileOpen(false)} queueCounts={queueCounts} />
              <NavLink item={workspaceTrainingAdminItem} pathname={pathname} onNavigate={() => setMobileOpen(false)} queueCounts={queueCounts} />
            </AdminSubgroup>
            <AdminSubgroup tone={ADMIN_SUBGROUP_TONES.symposium} label="2026 Symposium">
              <NavLink item={workspaceSymposiumItem} pathname={pathname} onNavigate={() => setMobileOpen(false)} queueCounts={queueCounts} />
              <NavLink item={workspaceLogoVoteItem} pathname={pathname} onNavigate={() => setMobileOpen(false)} queueCounts={queueCounts} />
              <NavLink item={workspaceSpeakersItem} pathname={pathname} onNavigate={() => setMobileOpen(false)} queueCounts={queueCounts} />
              <NavLink item={workspaceAvItem} pathname={pathname} onNavigate={() => setMobileOpen(false)} queueCounts={queueCounts} />
              <NavLink item={workspaceMerchItem} pathname={pathname} onNavigate={() => setMobileOpen(false)} queueCounts={queueCounts} />
            </AdminSubgroup>
            <AdminSubgroup tone={ADMIN_SUBGROUP_TONES.operations} label="Industry Insights">
              <NavLink item={workspaceInsightsSpeakersItem} pathname={pathname} onNavigate={() => setMobileOpen(false)} queueCounts={queueCounts} />
            </AdminSubgroup>
            <AdminSubgroup tone={ADMIN_SUBGROUP_TONES.insights} label="Marketing">
              <NavLink item={workspaceGoogleAdsItem} pathname={pathname} onNavigate={() => setMobileOpen(false)} queueCounts={queueCounts} />
              <NavLink item={workspaceVideoItem} pathname={pathname} onNavigate={() => setMobileOpen(false)} queueCounts={queueCounts} />
              <NavLink item={workspaceSponsorshipItem} pathname={pathname} onNavigate={() => setMobileOpen(false)} queueCounts={queueCounts} />
              <NavLink item={workspaceNewsletterItem} pathname={pathname} onNavigate={() => setMobileOpen(false)} queueCounts={queueCounts} />
            </AdminSubgroup>
            <AdminSubgroup tone={ADMIN_SUBGROUP_TONES.engage} label="Website">
              <NavLink item={workspaceWebsiteReviewItem} pathname={pathname} onNavigate={() => setMobileOpen(false)} queueCounts={queueCounts} />
            </AdminSubgroup>
            {/* The general tools. Admin moved to 2026 Symposium — it is
                only ever about that event — and is deliberately NOT
                listed twice: a link in two places is two things to keep
                in step and one of them is always the stale one. */}
            <AdminSubgroup tone={ADMIN_SUBGROUP_TONES.equip} label="Process">
              <NavLink item={workspaceFlowChartsItem} pathname={pathname} onNavigate={() => setMobileOpen(false)} queueCounts={queueCounts} />
              <NavLink item={workspaceFormsItem} pathname={pathname} onNavigate={() => setMobileOpen(false)} queueCounts={queueCounts} />
            </AdminSubgroup>
            <AdminSubgroup tone={ADMIN_SUBGROUP_TONES.experience} label="Outreach">
              <NavLink item={workspaceOutreachContactsItem} pathname={pathname} onNavigate={() => setMobileOpen(false)} queueCounts={queueCounts} />
              <NavLink item={workspaceOutreachCampaignsItem} pathname={pathname} onNavigate={() => setMobileOpen(false)} queueCounts={queueCounts} />
            </AdminSubgroup>
          </SectionGroup>
        )}

        {isAdmin && (
          <SectionGroup
            title={t("nav.administration").toUpperCase()}
            tone="electric"
            description="Privileged territory — manage learners, employers, the EQUIP pillar, the platform itself, and security. Sub-grouped into ENGAGE / EXPERIENCE / EQUIP / Insights / Platform / Security & compliance / System so each list stays scannable."
          >
            {/* Overview sits at the top, ungrouped — single canonical link. */}
            <NavLink item={adminOverview} pathname={pathname} onNavigate={() => setMobileOpen(false)} queueCounts={queueCounts} />

            {visibleEngageAdmin.length > 0 && (
              <AdminSubgroup tone={ADMIN_SUBGROUP_TONES.engage} label="Engage">
                {visibleEngageAdmin.map((item) => (
                  <NavLink key={item.href} item={item} pathname={pathname} onNavigate={() => setMobileOpen(false)} queueCounts={queueCounts} />
                ))}
              </AdminSubgroup>
            )}

            {visibleExperienceAdmin.length > 0 && (
              <AdminSubgroup tone={ADMIN_SUBGROUP_TONES.experience} label="Experience">
                {visibleExperienceAdmin.map((item) => (
                  <NavLink key={item.href} item={item} pathname={pathname} onNavigate={() => setMobileOpen(false)} queueCounts={queueCounts} />
                ))}
              </AdminSubgroup>
            )}

            {visibleEquipAdmin.length > 0 && (
              <AdminSubgroup tone={ADMIN_SUBGROUP_TONES.equip} label="Equip">
                {visibleEquipAdmin.map((item) => (
                  <NavLink key={item.href} item={item} pathname={pathname} onNavigate={() => setMobileOpen(false)} queueCounts={queueCounts} />
                ))}
              </AdminSubgroup>
            )}

            {/*
              Operations sits between Equip and Insights — the three
              pillars (Engage / Experience / Equip) are pipeline-shaped
              work that happens IN the platform, then Operations is the
              cross-pillar mechanics that keep the platform running,
              and Insights is what you look at after the work is done.
            */}
            {visibleOperationsAdmin.length > 0 && (
              <AdminSubgroup tone={ADMIN_SUBGROUP_TONES.operations} label="Operations">
                {visibleOperationsAdmin.map((item) => (
                  <NavLink key={item.href} item={item} pathname={pathname} onNavigate={() => setMobileOpen(false)} queueCounts={queueCounts} />
                ))}
              </AdminSubgroup>
            )}

            {visibleInsightsAdmin.length > 0 && (
              <AdminSubgroup tone={ADMIN_SUBGROUP_TONES.insights} label="Design & Insight">
                {visibleInsightsAdmin.map((item) => (
                  <NavLink key={item.href} item={item} pathname={pathname} onNavigate={() => setMobileOpen(false)} queueCounts={queueCounts} />
                ))}
              </AdminSubgroup>
            )}

            {/* HR-view preview was here; moved out of Admin into
                its own top-level SectionGroup placed before the
                misc items (Learning buddies, Change log) so it
                reads as a peer surface, not buried under
                Administration. */}

            {visiblePlatformAdmin.length > 0 && (
              <AdminSubgroup tone={ADMIN_SUBGROUP_TONES.platform} label="Platform">
                {/* Platform is 11 items (was 24) — flat list
                    like Engage / Experience. The collapsible UI
                    that gated 24 items behind a click is removed
                    in favour of consistent visual treatment
                    across the sub-groups. */}
                {visiblePlatformAdmin.map((item) => (
                  <NavLink key={item.href} item={item} pathname={pathname} onNavigate={() => setMobileOpen(false)} queueCounts={queueCounts} />
                ))}
              </AdminSubgroup>
            )}

            {visibleSecurityAdmin.length > 0 && (
              <AdminSubgroup tone={ADMIN_SUBGROUP_TONES.security} label="Security & compliance">
                {visibleSecurityAdmin.map((item) => (
                  <NavLink key={item.href} item={item} pathname={pathname} onNavigate={() => setMobileOpen(false)} queueCounts={queueCounts} />
                ))}
              </AdminSubgroup>
            )}

            {visibleSystemAdmin.length > 0 && (
              <AdminSubgroup tone={ADMIN_SUBGROUP_TONES.system} label="System (superadmin)">
                {visibleSystemAdmin.map((item) => (
                  <NavLink key={item.href} item={item} pathname={pathname} onNavigate={() => setMobileOpen(false)} queueCounts={queueCounts} />
                ))}
              </AdminSubgroup>
            )}
          </SectionGroup>
        )}
      </nav>

      {/*
       * Compact footer stack. Each block is a thin row instead of the
       * earlier card-with-padding layout — saves ~140 px of vertical
       * space on a typical sidebar without losing any control.
       *
       *   • Credits chip — single inline pill, no surrounding card.
       *   • Role switcher — same height as a nav link.
       *   • Take the tour + Theme picker share one row to halve the
       *     vertical footprint of "help / personalisation".
       *   • Build SHA folds into the user pill's right edge for staff,
       *     so it doesn't take its own row.
       *   • User block: avatar-sized pill (32 px) + sign-out icon
       *     button on the same row, no double-stacked layout.
       */}

      {/* Credits chip */}
      {!isStaff && credits !== undefined && (
        <div className="px-3 py-1.5 border-t border-line">
          <div className="flex items-center gap-1.5 bg-amber-50 rounded-md px-2 py-1">
            <Coins size={11} className="text-amber-500 shrink-0" />
            <p className="text-[11px] text-amber-700 font-semibold leading-none">
              {credits.toLocaleString()} BHN Credits
            </p>
          </div>
        </div>
      )}

      {/* Superadmin-only role switcher — single thin row */}
      {realRole === "superadmin" && (
        <div className="px-3 py-1.5 border-t border-line">
          <RoleSwitcher actingAs={actingAs ?? null} />
        </div>
      )}

      {/* Portfolio-demo strip — only ever renders on the demo deployment
          (NEXT_PUBLIC_DEMO_MODE), same pattern as the build-SHA chip below.
          Lives in the sidebar footer, not above the page hero, per the
          hero-owns-the-top rule. */}
      {process.env.NEXT_PUBLIC_DEMO_MODE === "true" && (
        <div className="px-3 py-2 border-t border-line">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700">
            Demo environment
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-subtle">
            Synthetic data · resets nightly ·{" "}
            <a href="/demo" className="font-semibold text-brand-700 hover:text-brand-900">
              switch persona
            </a>{" "}
            ·{" "}
            <a href="/demo/about" className="font-semibold text-brand-700 hover:text-brand-900">
              about this build
            </a>
          </p>
        </div>
      )}

      {/* Take-the-tour + Theme picker + Build SHA share one compact row.
          Tour icon is Compass (orientation / guided exploration) rather
          than the generic ?-help glyph it used to be. Build SHA folds
          in here — staff-only — so the user pill row below stays a
          clean two-line identity card without the chip eating space. */}
      <div className="px-2 py-1 border-t border-line flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("bhn:start-tour"));
            }
          }}
          className="flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium text-muted hover:bg-raised hover:text-fg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
          title={t("nav.tour")}
        >
          <Compass size={13} className="shrink-0" />
          <span className="truncate">{t("nav.tour")}</span>
        </button>
        <ThemePicker compact />
        {isStaff && process.env.NEXT_PUBLIC_COMMIT_SHA && (
          <code
            className="font-mono text-[11px] font-semibold text-brand-700 bg-brand-50 ring-1 ring-inset ring-brand-200 px-1.5 py-1 rounded select-all leading-none shrink-0"
            title={`Build ${process.env.NEXT_PUBLIC_COMMIT_SHA}`}
          >
            {process.env.NEXT_PUBLIC_COMMIT_SHA}
          </code>
        )}
      </div>

      {/* User pill — single 36 px row with sign-out as an icon button. */}
      <div className="px-2 py-2 border-t border-line flex items-center gap-1">
        <Link
          href="/profile"
          className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-elevated transition-colors group"
        >
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center text-xs font-bold shadow-sm shrink-0">
            {user.name?.[0]?.toUpperCase() ?? user.email?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-fg truncate leading-tight">
              {user.name ?? "User"}
            </p>
            <p className="text-[10px] text-subtle truncate group-hover:text-muted leading-tight">
              {user.email}
            </p>
          </div>
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="p-1.5 rounded-lg text-muted hover:bg-elevated hover:text-fg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
          title={t("nav.signOut")}
          aria-label={t("nav.signOut")}
        >
          <LogOut size={14} />
        </button>
      </div>
    </nav>
    </>
  );
}
