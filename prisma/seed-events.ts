/**
 * BHN Events module — the ORIGINAL 2025 demo seed. Superseded.
 *
 * ⚠️  This builds LAST YEAR'S event. The 2025 workshops it upserts were
 * deleted deliberately on 2026-08-20; running this without thinking
 * puts all nine back, along with their demo bookings, and the Admin
 * dashboard starts reporting a week that is not happening.
 *
 * The week being run is 2026. Its workshops and registration form come
 * from scripts/seed-training-week-2026.ts. This script is kept because
 * it also seeds the event shell, the symposium agenda, speakers and
 * sponsors, which nothing else does yet — but it now refuses to run
 * unless you pass --force and mean it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * Original header:
 *
 * BHN Events module — idempotent seed for the 2025 Annual Symposium
 * & Training Week.
 *
 * Reproduces the public event structure as a working demo:
 *   • 1 BhnEvent (2026-annual-symposium, Oct 27–30, status published)
 *   • 9 Workshop rows (multi-slot workshops split: CL3 morning + PM,
 *     BioZone morning + PM are separate rows by design)
 *   • 15 SymposiumSession rows (Oct 30 agenda, two parallel breakouts
 *     grouped by breakoutGroupId for pick-one UX)
 *   • 12 Speaker rows linked to their sessions via SymposiumSessionSpeaker
 *   • 9 Sponsor rows (7 partners + 2 funders)
 *   • 5 demo attendee users + Registration rows
 *   • 12 CL3-tour demo users (10 confirmed + 2 waitlist) — demonstrates
 *     the full + waitlist state on one workshop
 *   • 2 demo WorkshopBookings on other workshops (OBIO + Agilis)
 *   • 3 PersonalAgendaEntry rows on the afternoon breakouts
 *
 * Idempotency: every upsert is keyed on a natural unique
 * (slug, composite, email) or a stable string ID prefixed with the
 * entity type (evt- / ws- / ss- / spk- / spn-). Re-running the seed
 * updates existing rows in place; it does not create duplicates.
 *
 * Run:    npx tsx prisma/seed-events.ts
 * Reads:  DATABASE_URL
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";

const prisma = new PrismaClient();

// ─── Stable IDs ─────────────────────────────────────────────────
const EVENT_ID = "evt-2025-annual-symposium";
/*
 * The slug is this year's. The ID is NOT — every workshop,
 * registration and speaker row points at it, and renaming a primary
 * key to make it read nicely is how you break a database for
 * cosmetics. Nobody outside this table sees it.
 */
const EVENT_SLUG = "2026-annual-symposium";
const wsId = (slug: string) => `ws-${slug}`;
const ssId = (slug: string) => `ss-${slug}`;
const spkId = (slug: string) => `spk-${slug}`;
const spnId = (slug: string) => `spn-${slug}`;

// EDT is UTC-04 (October 2025 is before DST ends on Nov 2). All
// timestamps below are written as local wall-clock with the -04:00
// suffix so they round-trip cleanly through Postgres TIMESTAMP(3).
const dt = (iso: string): Date => new Date(`${iso}-04:00`);

/**
 * Deterministic 32-char hex token for Registration.qrToken so
 * re-running the seed doesn't churn the unique constraint. Real
 * registrations (Phase 1) will use crypto.randomBytes.
 */
function stableQrToken(eventId: string, userId: string): string {
  return createHash("sha256")
    .update(`${eventId}:${userId}:bhn-events-seed`)
    .digest("hex")
    .slice(0, 32);
}

// ─── Workshops (Oct 27–29) ──────────────────────────────────────
//
// Per the symposium tour/workshop policy: every slot defaults to a
// 20-seat capacity, a 5-spot waitlist, and admin approval — applied
// here uniformly except where physical capacity caps the room
// (CL3, BioZone bench-scale bioreactor space).
const TOUR_DEFAULTS = {
  /** Hard cap on confirmed seats. Overridable per workshop below. */
  capacity: 20,
  /** Hard cap on waitlist length. Once full, the booking endpoint
   *  returns waitlist_full. */
  waitlistCapacity: 5,
  /** Whether new bookings need admin approval before the seat is
   *  held — symposium policy is `true` by default. */
  requiresApproval: true,
} as const;

const WORKSHOPS = [
  {
    id: wsId("obio-bootcamp"),
    slug: "obio-bootcamp",
    title: "OBIO Entrepreneurship Bootcamp",
    shortDescription: "Three-day intensive for trainee-led life-sciences ventures at the pre-seed stage.",
    longDescription:
      "Hands-on bootcamp covering market access, IP strategy, regulatory pathway, " +
      "business planning, financing options, and pitching. Open to BioHubNet trainees with at " +
      "least an invention disclosure filed at their home institution.",
    partnerOrganization: "OBIO",
    kind: "bootcamp",
    startDateTime: dt("2025-10-27T09:00:00"),
    endDateTime: dt("2025-10-29T17:00:00"),
    locationName: "University of Toronto",
    locationAddress: null,
    requiresTransport: false,
    departureLocation: null,
    capacity: 30,
    waitlistCapacity: 5,
    requiresApproval: true,
    learnMoreUrl: "https://biohubnet.ca/2025-annual-symposium/2025-annual-symposium-and-training-week-obio-bootcamp/",
    displayOrder: 1,
  },
  {
    id: wsId("agilis-medical-affairs"),
    slug: "agilis-medical-affairs",
    title: "Agilis Health Medical Affairs Workshop",
    shortDescription: "Half-day introduction to medical-affairs functions in industry.",
    longDescription:
      "Session led by Agilis Health on Medical Science Liaison roles, scientific " +
      "communication, KOL engagement, and the medical-affairs side of pharmaceutical " +
      "commercialization.",
    partnerOrganization: "Agilis Health",
    kind: "workshop",
    startDateTime: dt("2025-10-27T13:00:00"),
    endDateTime: dt("2025-10-27T16:00:00"),
    locationName: "University of Toronto",
    locationAddress: null,
    requiresTransport: false,
    departureLocation: null,
    capacity: 50,
    waitlistCapacity: 5,
    requiresApproval: true,
    learnMoreUrl: "https://biohubnet.ca/?page_id=8134",
    displayOrder: 2,
  },
  {
    id: wsId("catti-cell-manufacturing"),
    slug: "catti-cell-manufacturing",
    title: "CATTI Cell Manufacturing & GDP Workshop",
    shortDescription: "Full-day aseptic-technique and Good Distribution Practice workshop at the University of Guelph.",
    longDescription:
      "Cell-manufacturing fundamentals, aseptic gowning, and GDP standards. Bus transport provided " +
      "from the U of T St. George campus — meet at the curb.",
    partnerOrganization: "CATTI",
    kind: "workshop",
    startDateTime: dt("2025-10-28T09:00:00"),
    endDateTime: dt("2025-10-28T17:00:00"),
    locationName: "University of Guelph",
    locationAddress: null,
    requiresTransport: true,
    departureLocation: "U of T St. George campus",
    capacity: 24,
    waitlistCapacity: 5,
    requiresApproval: true,
    learnMoreUrl: "https://biohubnet.ca/aseptic-techniques-and-gdp-workshop",
    displayOrder: 3,
  },
  {
    id: wsId("cl3-tour-am"),
    slug: "cl3-tour-am",
    title: "Toronto High Containment Facility CL3 Tour — Morning",
    shortDescription: "One-hour guided tour of the U of T CL3 facility. Hard 10-person cap.",
    longDescription:
      "Behind-the-scenes look at U of T's Containment Level 3 facility: biosafety procedures, " +
      "containment design, sample workflows. Morning slot.",
    partnerOrganization: "University of Toronto",
    kind: "tour",
    startDateTime: dt("2025-10-28T11:00:00"),
    endDateTime: dt("2025-10-28T12:00:00"),
    locationName: "University of Toronto",
    locationAddress: null,
    requiresTransport: false,
    departureLocation: null,
    capacity: 10,
    waitlistCapacity: 5,
    requiresApproval: true,
    learnMoreUrl: "https://biohubnet.ca/toronto-high-containment-facility-cl3-facility-tour/",
    displayOrder: 4,
  },
  {
    id: wsId("cl3-tour-pm"),
    slug: "cl3-tour-pm",
    title: "Toronto High Containment Facility CL3 Tour — Afternoon",
    shortDescription: "One-hour guided tour of the U of T CL3 facility. Hard 10-person cap.",
    longDescription:
      "Same tour content as the morning slot. Afternoon timing for trainees attending the " +
      "BioZone morning workshop.",
    partnerOrganization: "University of Toronto",
    kind: "tour",
    startDateTime: dt("2025-10-28T14:00:00"),
    endDateTime: dt("2025-10-28T15:00:00"),
    locationName: "University of Toronto",
    locationAddress: null,
    requiresTransport: false,
    departureLocation: null,
    capacity: 10,
    waitlistCapacity: 5,
    requiresApproval: true,
    learnMoreUrl: "https://biohubnet.ca/toronto-high-containment-facility-cl3-facility-tour/",
    displayOrder: 5,
  },
  {
    id: wsId("biozone-bioreactor-am"),
    slug: "biozone-bioreactor-am",
    title: "BioZone Bioreactor Workshop — Morning",
    shortDescription: "Hands-on bench-scale bioreactor operation in BioZone's lab. 10-person cap.",
    longDescription:
      "Direct hands-on time with bench-scale bioreactors, run by BioZone (U of T). " +
      "Morning slot.",
    partnerOrganization: "BioZone",
    kind: "workshop",
    startDateTime: dt("2025-10-28T10:00:00"),
    endDateTime: dt("2025-10-28T13:00:00"),
    locationName: "University of Toronto",
    locationAddress: null,
    requiresTransport: false,
    departureLocation: null,
    capacity: 10,
    waitlistCapacity: 5,
    requiresApproval: true,
    learnMoreUrl: "https://biohubnet.ca/biozone-bioreactor-workshop/",
    displayOrder: 6,
  },
  {
    id: wsId("biozone-bioreactor-pm"),
    slug: "biozone-bioreactor-pm",
    title: "BioZone Bioreactor Workshop — Afternoon",
    shortDescription: "Hands-on bench-scale bioreactor operation in BioZone's lab. 10-person cap.",
    longDescription:
      "Same content as the morning slot. Afternoon timing for trainees attending the CL3 " +
      "morning tour.",
    partnerOrganization: "BioZone",
    kind: "workshop",
    startDateTime: dt("2025-10-28T13:30:00"),
    endDateTime: dt("2025-10-28T16:30:00"),
    locationName: "University of Toronto",
    locationAddress: null,
    requiresTransport: false,
    departureLocation: null,
    capacity: 10,
    waitlistCapacity: 5,
    requiresApproval: true,
    learnMoreUrl: "https://biohubnet.ca/biozone-bioreactor-workshop/",
    displayOrder: 7,
  },
  {
    id: wsId("omniabio-tour"),
    slug: "omniabio-tour",
    title: "OmniaBio Company Tour",
    shortDescription: "Full-day tour of OmniaBio's GMP cell-therapy manufacturing site in Hamilton.",
    longDescription:
      "Walk OmniaBio's GMP cell-therapy floor in Hamilton: cleanroom design, fill-finish, " +
      "QC operations. Bus transport provided from U of T St. George.",
    partnerOrganization: "OmniaBio",
    kind: "tour",
    startDateTime: dt("2025-10-29T09:00:00"),
    endDateTime: dt("2025-10-29T15:00:00"),
    locationName: "Hamilton",
    locationAddress: null,
    requiresTransport: true,
    departureLocation: "U of T St. George campus",
    capacity: 40,
    waitlistCapacity: 5,
    requiresApproval: true,
    learnMoreUrl: "https://biohubnet.ca/omniabio-company-tour/",
    displayOrder: 8,
  },
  {
    id: wsId("eurofins-tour"),
    slug: "eurofins-tour",
    title: "Eurofins CDMO Alphora Inc. Tour",
    shortDescription: "Full-day site visit to Eurofins' Mississauga CDMO facility.",
    longDescription:
      "Tour Eurofins CDMO Alphora's Mississauga operations: analytical labs, formulation, " +
      "GMP-scale process development. Bus transport provided from U of T St. George.",
    partnerOrganization: "Eurofins CDMO Alphora Inc.",
    kind: "tour",
    startDateTime: dt("2025-10-29T10:00:00"),
    endDateTime: dt("2025-10-29T15:00:00"),
    locationName: "Mississauga",
    locationAddress: null,
    requiresTransport: true,
    departureLocation: "U of T St. George campus",
    capacity: 30,
    waitlistCapacity: 5,
    requiresApproval: true,
    learnMoreUrl: "https://biohubnet.ca/eurofins-cdmo-alphora-inc-tour/",
    displayOrder: 9,
  },
];

// ─── Symposium-day sessions (Oct 30 at Chelsea Hotel Toronto) ──
const SESSIONS = [
  {
    id: ssId("registration"),
    title: "Registration & Breakfast",
    description: "Check in, pick up your badge, and grab breakfast in the Mountbatten foyer.",
    startTime: dt("2025-10-30T08:15:00"),
    endTime: dt("2025-10-30T09:00:00"),
    room: "Mountbatten Foyer",
    kind: "registration",
    isSelectable: false,
    breakoutGroupId: null,
    displayOrder: 1,
  },
  {
    id: ssId("welcome"),
    title: "Welcome Remarks & Land Acknowledgement",
    description: "Opening from BioHubNet leadership.",
    startTime: dt("2025-10-30T09:00:00"),
    endTime: dt("2025-10-30T09:05:00"),
    room: "Mountbatten Salon A & B",
    kind: "opening",
    isSelectable: false,
    breakoutGroupId: null,
    displayOrder: 2,
  },
  {
    id: ssId("about-bhn"),
    title: "About BioHubNet: Core Programs",
    description: "Overview of BioHubNet's training, internship, and matching programs.",
    startTime: dt("2025-10-30T09:05:00"),
    endTime: dt("2025-10-30T09:20:00"),
    room: "Mountbatten Salon A & B",
    kind: "presentation",
    isSelectable: false,
    breakoutGroupId: null,
    displayOrder: 3,
  },
  {
    id: ssId("keynote-future-biomanufacturing"),
    title: "Keynote: Future of Biomanufacturing",
    description: null,
    startTime: dt("2025-10-30T09:20:00"),
    endTime: dt("2025-10-30T10:05:00"),
    room: "Mountbatten Salon A & B",
    kind: "keynote",
    isSelectable: false,
    breakoutGroupId: null,
    displayOrder: 4,
  },
  {
    id: ssId("panel-1-beyond-the-bench"),
    title: "Panel 1: Beyond the Bench — Key skills and competencies for industry readiness",
    description: null,
    startTime: dt("2025-10-30T10:05:00"),
    endTime: dt("2025-10-30T10:50:00"),
    room: "Mountbatten Salon A & B",
    kind: "panel",
    isSelectable: false,
    breakoutGroupId: null,
    displayOrder: 5,
  },
  {
    id: ssId("break-morning"),
    title: "Refreshment Break",
    description: null,
    startTime: dt("2025-10-30T10:50:00"),
    endTime: dt("2025-10-30T11:10:00"),
    room: "Mountbatten Foyer",
    kind: "break",
    isSelectable: false,
    breakoutGroupId: null,
    displayOrder: 6,
  },
  {
    id: ssId("panel-2-inside-industry"),
    title: "Panel 2: Inside Industry — Real-world career journeys",
    description: null,
    startTime: dt("2025-10-30T11:10:00"),
    endTime: dt("2025-10-30T11:55:00"),
    room: "Mountbatten Salon A & B",
    kind: "panel",
    isSelectable: false,
    breakoutGroupId: null,
    displayOrder: 7,
  },
  {
    id: ssId("spotlight-equip"),
    title: "Spotlight on EQUIP VentureLift Awardees",
    description: null,
    startTime: dt("2025-10-30T11:55:00"),
    endTime: dt("2025-10-30T12:30:00"),
    room: "Mountbatten Salon A & B",
    kind: "spotlight",
    isSelectable: false,
    breakoutGroupId: null,
    displayOrder: 8,
  },
  {
    id: ssId("lunch"),
    title: "Lunch & Networking",
    description: null,
    startTime: dt("2025-10-30T12:30:00"),
    endTime: dt("2025-10-30T13:30:00"),
    room: "Mountbatten Foyer",
    kind: "meal",
    isSelectable: false,
    breakoutGroupId: null,
    displayOrder: 9,
  },
  {
    id: ssId("breakout-a-innovation"),
    title: "Breakout A — Shaping Canada's Future: Innovation, Partnerships & Talent Development",
    description: "Interactive discussion. Pick this OR Breakout B (they run in parallel).",
    startTime: dt("2025-10-30T13:30:00"),
    endTime: dt("2025-10-30T15:10:00"),
    room: "Mountbatten Salon A",
    kind: "breakout",
    isSelectable: true,
    breakoutGroupId: "afternoon-breakouts",
    displayOrder: 10,
  },
  {
    id: ssId("breakout-b-storytelling"),
    title: "Breakout B — Storytelling & Designing Your Career",
    description: "Professional-development workshop. Pick this OR Breakout A.",
    startTime: dt("2025-10-30T13:30:00"),
    endTime: dt("2025-10-30T15:10:00"),
    room: "Mountbatten Salon B",
    kind: "breakout",
    isSelectable: true,
    breakoutGroupId: "afternoon-breakouts",
    displayOrder: 11,
  },
  {
    id: ssId("break-afternoon"),
    title: "Refreshment Break",
    description: null,
    startTime: dt("2025-10-30T15:10:00"),
    endTime: dt("2025-10-30T15:30:00"),
    room: "Mountbatten Foyer",
    kind: "break",
    isSelectable: false,
    breakoutGroupId: null,
    displayOrder: 12,
  },
  {
    id: ssId("pitch-competition"),
    title: "Pitch Competition",
    description: null,
    startTime: dt("2025-10-30T15:30:00"),
    endTime: dt("2025-10-30T16:45:00"),
    room: "Mountbatten Salon A & B",
    kind: "pitch_competition",
    isSelectable: false,
    breakoutGroupId: null,
    displayOrder: 13,
  },
  {
    id: ssId("closing"),
    title: "Closing Remarks",
    description: null,
    startTime: dt("2025-10-30T16:45:00"),
    endTime: dt("2025-10-30T17:00:00"),
    room: "Mountbatten Salon A & B",
    kind: "closing",
    isSelectable: false,
    breakoutGroupId: null,
    displayOrder: 14,
  },
  {
    id: ssId("networking-reception"),
    title: "Networking Reception",
    description: "Cocktails and conversation to close out the day.",
    startTime: dt("2025-10-30T17:00:00"),
    endTime: dt("2025-10-30T19:00:00"),
    room: "Mountbatten Foyer",
    kind: "networking",
    isSelectable: false,
    breakoutGroupId: null,
    displayOrder: 15,
  },
];

// ─── Speakers ───────────────────────────────────────────────────
const SPEAKERS = [
  {
    id: spkId("kelley-parato"),
    fullName: "Kelley Parato",
    title: "R&D Director, Bioprocess Engineering",
    organization: "Human Health Therapeutics Research Centre, National Research Council Canada",
    bio: "Keynote speaker on the future of biomanufacturing.",
    photoUrl: "https://biohubnet.ca/wp-content/uploads/2025/09/bio-kelley-parato-265x352-1-150x150.jpg",
    displayOrder: 1,
  },
  {
    id: spkId("rob-henderson"),
    fullName: "Rob Henderson",
    title: "President and CEO",
    organization: "BioTalent Canada",
    bio: null,
    photoUrl: "https://biohubnet.ca/wp-content/uploads/2025/09/Rob-Henderson-150x150.png",
    displayOrder: 2,
  },
  {
    id: spkId("ana-mcgovern"),
    fullName: "Ana McGovern",
    title: "Executive Recruiter & Career Coach",
    organization: "McGovern Management Group Inc.",
    bio: null,
    photoUrl: "https://biohubnet.ca/wp-content/uploads/2025/09/Ana-McGovern-1-150x150.jpg",
    displayOrder: 3,
  },
  {
    id: spkId("cynthia-elias"),
    fullName: "Cynthia Elias",
    title: "Senior Principal Scientist, PhD",
    organization: "Sanofi",
    bio: null,
    photoUrl: "https://biohubnet.ca/wp-content/uploads/2025/09/Cynthia-Elias-profile-picture-150x150.jpg",
    displayOrder: 4,
  },
  {
    id: spkId("logan-germain"),
    fullName: "Logan Germain",
    title: "PhD Candidate, BioHubNet Trainee",
    organization: "Queen's University",
    bio: null,
    photoUrl: "https://biohubnet.ca/wp-content/uploads/2025/09/LOGAN-GERMAIN-150x150.jpg",
    displayOrder: 5,
  },
  {
    id: spkId("neil-blackburn"),
    fullName: "Neil Blackburn",
    title: "Senior Director, Process & Analytical Development, PhD",
    organization: "OmniaBio Inc.",
    bio: null,
    photoUrl: "https://biohubnet.ca/wp-content/uploads/2025/09/Neil-Blackburn-150x150.jpg",
    displayOrder: 6,
  },
  {
    id: spkId("david-sealey"),
    fullName: "David Sealey",
    title: "Director, Regulatory Affairs (Oncology), PhD",
    organization: "AstraZeneca Canada",
    bio: null,
    photoUrl: "https://biohubnet.ca/wp-content/uploads/2025/09/David-Sealey-147x150.png",
    displayOrder: 7,
  },
  {
    id: spkId("lisa-wise-milestone"),
    fullName: "Lisa Wise-Milestone",
    title: "Associate Director, Strategic Partnerships, PhD, P.Eng.",
    organization: "Moderna Canada",
    bio: null,
    photoUrl: "https://biohubnet.ca/wp-content/uploads/2025/09/Lisa-Wise-Milestone-150x150.jpg",
    displayOrder: 8,
  },
  {
    id: spkId("helen-sarantis"),
    fullName: "Helen Sarantis",
    title: "Associate Director, Analytical & Quality Control, PhD",
    organization: "BlueRock Therapeutics",
    bio: null,
    photoUrl: "https://biohubnet.ca/wp-content/uploads/2025/09/Helen-Sarantis-150x150.jpeg",
    displayOrder: 9,
  },
  {
    id: spkId("jonathan-labriola"),
    fullName: "Jonathan Labriola",
    title: "Director of Operations, PhD, BioHubNet Trainee",
    organization: "Synakis",
    bio: null,
    photoUrl: "https://biohubnet.ca/wp-content/uploads/2025/09/Jon-150x140.jpg",
    displayOrder: 10,
  },
  {
    id: spkId("nana-lee"),
    fullName: "Nana Hyung-Ran Lee",
    title: "Associate Professor (Teaching Stream), Director of Graduate Professional Development, PhD",
    organization: "Temerty Faculty of Medicine, University of Toronto",
    bio: null,
    photoUrl: "https://biohubnet.ca/wp-content/uploads/2025/10/Nana-150x150.jpg",
    displayOrder: 11,
  },
  {
    id: spkId("ketheisan-vigneshwaran"),
    fullName: "Ketheisan Vigneshwaran",
    title: "Career Educator, BMath, BEd",
    organization: "Career Exploration & Education, Student Life, University of Toronto",
    bio: null,
    photoUrl: "https://biohubnet.ca/wp-content/uploads/2025/10/Ketheisan-150x150.jpg",
    displayOrder: 12,
  },
];

// ─── Speaker → Session links ────────────────────────────────────
const SPEAKER_LINKS = [
  // Keynote
  { sessionId: ssId("keynote-future-biomanufacturing"), speakerId: spkId("kelley-parato"), role: "speaker", order: 1 },
  // Panel 1: Beyond the Bench
  { sessionId: ssId("panel-1-beyond-the-bench"), speakerId: spkId("rob-henderson"), role: "panelist", order: 1 },
  { sessionId: ssId("panel-1-beyond-the-bench"), speakerId: spkId("ana-mcgovern"), role: "panelist", order: 2 },
  { sessionId: ssId("panel-1-beyond-the-bench"), speakerId: spkId("cynthia-elias"), role: "panelist", order: 3 },
  { sessionId: ssId("panel-1-beyond-the-bench"), speakerId: spkId("logan-germain"), role: "panelist", order: 4 },
  // Panel 2: Inside Industry
  { sessionId: ssId("panel-2-inside-industry"), speakerId: spkId("neil-blackburn"), role: "panelist", order: 1 },
  { sessionId: ssId("panel-2-inside-industry"), speakerId: spkId("david-sealey"), role: "panelist", order: 2 },
  { sessionId: ssId("panel-2-inside-industry"), speakerId: spkId("lisa-wise-milestone"), role: "panelist", order: 3 },
  { sessionId: ssId("panel-2-inside-industry"), speakerId: spkId("helen-sarantis"), role: "panelist", order: 4 },
  { sessionId: ssId("panel-2-inside-industry"), speakerId: spkId("jonathan-labriola"), role: "panelist", order: 5 },
  // Breakout B: Storytelling & Designing Your Career
  { sessionId: ssId("breakout-b-storytelling"), speakerId: spkId("nana-lee"), role: "facilitator", order: 1 },
  { sessionId: ssId("breakout-b-storytelling"), speakerId: spkId("ketheisan-vigneshwaran"), role: "facilitator", order: 2 },
];

// ─── Sponsors / partners / funders ──────────────────────────────
// Public page presents these flat; classifying by role:
//   "partner" — workshop / tour delivery partners
//   "funder"  — funding bodies
const SPONSORS = [
  { id: spnId("obio"),                name: "OBIO",                                  tier: "partner", website: "https://obio.ca",       displayOrder: 1 },
  { id: spnId("omniabio"),            name: "OmniaBio",                              tier: "partner", website: "https://omniabio.com",  displayOrder: 2 },
  { id: spnId("agilis-health"),       name: "Agilis Health",                         tier: "partner", website: null,                    displayOrder: 3 },
  { id: spnId("catti"),               name: "CATTI",                                 tier: "partner", website: null,                    displayOrder: 4 },
  { id: spnId("epic-uoft"),           name: "EPIC, University of Toronto",           tier: "partner", website: null,                    displayOrder: 5 },
  { id: spnId("biozone"),             name: "BioZone",                               tier: "partner", website: null,                    displayOrder: 6 },
  { id: spnId("eurofins"),            name: "Eurofins CDMO Alphora Inc.",            tier: "partner", website: null,                    displayOrder: 7 },
  { id: spnId("palette-skills"),      name: "Palette Skills",                        tier: "funder",  website: "https://paletteskills.org", displayOrder: 8 },
  { id: spnId("government-of-canada"), name: "Government of Canada",                 tier: "funder",  website: null,                    displayOrder: 9 },
];

// ─── Demo attendees ─────────────────────────────────────────────
const ATTENDEES = [
  { email: "demo.attendee.trainee@biohubnet.test",  name: "Demo Trainee",         attendeeType: "trainee",  paymentProvider: "free",    paymentStatus: "waived" },
  { email: "demo.attendee.industry@biohubnet.test", name: "Demo Industry Pro",    attendeeType: "industry", paymentProvider: "invoice", paymentStatus: "paid" },
  { email: "demo.attendee.academic@biohubnet.test", name: "Demo Academic",        attendeeType: "academic", paymentProvider: "invoice", paymentStatus: "paid" },
  { email: "demo.attendee.student@biohubnet.test",  name: "Demo Grad Student",    attendeeType: "student",  paymentProvider: "free",    paymentStatus: "waived" },
  { email: "demo.attendee.sponsor@biohubnet.test",  name: "Demo Sponsor Contact", attendeeType: "sponsor",  paymentProvider: "free",    paymentStatus: "waived" },
];

// ─── Seed ───────────────────────────────────────────────────────
async function main() {
  // Refuses by default. A seed that recreates a deleted year is not
  // idempotent in any sense that helps — it is a time machine, and the
  // only symptom is last year quietly reappearing in this year's
  // dashboard.
  if (!process.argv.includes("--force")) {
    console.log(
      "This seeds the 2025 event, whose workshops were deliberately deleted.\n" +
      "The 2026 week is seeded by scripts/seed-training-week-2026.ts.\n" +
      "Re-run with --force if you really want 2025 back.",
    );
    return;
  }

  console.log("Seeding BHN Events module — 2025 Annual Symposium…");

  // 1. The Event itself
  await prisma.bhnEvent.upsert({
    where: { slug: EVENT_SLUG },
    create: {
      id: EVENT_ID,
      slug: EVENT_SLUG,
      title: "BioHubNet 2025 Annual Symposium & Training Week",
      tagline: "Shaping Canada's Biomanufacturing and Life Sciences Future",
      description:
        "A four-day BioHubNet event spanning hands-on training (Oct 27–29) and a full-day " +
        "symposium at the Chelsea Hotel Toronto (Oct 30). Workshops, partner site tours, " +
        "panels with industry leaders, and a pitch competition.",
      startDate: dt("2025-10-27T00:00:00"),
      endDate: dt("2025-10-30T23:59:59"),
      timezone: "America/Toronto",
      mainVenueName: "Chelsea Hotel, Toronto",
      mainVenueAddress: "33 Gerrard St W, Toronto, ON M5G 1Z4",
      mainVenueMapUrl: "https://maps.google.com/?q=Chelsea+Hotel+33+Gerrard+St+W+Toronto",
      coverImageUrl: null,
      status: "published",
      registrationOpensAt: null,
      registrationClosesAt: null,
      accommodationInfo:
        "A discounted block rate is available at the Chelsea Hotel Toronto for symposium " +
        "attendees. Contact the BioHubNet team via https://biohubnet.ca/contact/ for the " +
        "booking code.",
    },
    update: {
      title: "BioHubNet 2025 Annual Symposium & Training Week",
      tagline: "Shaping Canada's Biomanufacturing and Life Sciences Future",
      status: "published",
      mainVenueName: "Chelsea Hotel, Toronto",
      mainVenueAddress: "33 Gerrard St W, Toronto, ON M5G 1Z4",
    },
  });
  console.log(`  • BhnEvent ${EVENT_SLUG} upserted`);

  // 2. Workshops
  for (const w of WORKSHOPS) {
    await prisma.workshop.upsert({
      where: { eventId_slug: { eventId: EVENT_ID, slug: w.slug } },
      create: { eventId: EVENT_ID, ...w },
      update: { ...w, eventId: EVENT_ID },
    });
  }
  console.log(`  • ${WORKSHOPS.length} Workshop rows upserted`);

  // 3. Symposium sessions
  for (const s of SESSIONS) {
    await prisma.symposiumSession.upsert({
      where: { id: s.id },
      create: { eventId: EVENT_ID, ...s },
      update: { ...s, eventId: EVENT_ID },
    });
  }
  console.log(`  • ${SESSIONS.length} SymposiumSession rows upserted`);

  // 4. Speakers
  for (const sp of SPEAKERS) {
    await prisma.speaker.upsert({
      where: { id: sp.id },
      create: { eventId: EVENT_ID, ...sp },
      update: { ...sp, eventId: EVENT_ID },
    });
  }
  console.log(`  • ${SPEAKERS.length} Speaker rows upserted`);

  // 5. Speaker → Session links
  for (const link of SPEAKER_LINKS) {
    await prisma.symposiumSessionSpeaker.upsert({
      where: { sessionId_speakerId: { sessionId: link.sessionId, speakerId: link.speakerId } },
      create: link,
      update: { role: link.role, order: link.order },
    });
  }
  console.log(`  • ${SPEAKER_LINKS.length} SymposiumSessionSpeaker links upserted`);

  // 6. Sponsors
  for (const sp of SPONSORS) {
    await prisma.sponsor.upsert({
      where: { id: sp.id },
      create: { eventId: EVENT_ID, ...sp },
      update: { ...sp, eventId: EVENT_ID },
    });
  }
  console.log(`  • ${SPONSORS.length} Sponsor rows upserted`);

  // 7. Demo attendees + Registrations
  const passwordHash = await bcrypt.hash("demo1234", 10);
  const attendeeUsers: { id: string; email: string; name: string }[] = [];

  for (const a of ATTENDEES) {
    const user = await prisma.user.upsert({
      where: { email: a.email },
      create: {
        email: a.email,
        name: a.name,
        password: passwordHash,
        role: "trainee",
        accountKind: "demo",
        isActive: true,
        emailVerified: new Date(),
      },
      update: {
        name: a.name,
        accountKind: "demo",
      },
      select: { id: true, email: true, name: true },
    });

    await prisma.registration.upsert({
      where: { eventId_userId: { eventId: EVENT_ID, userId: user.id } },
      create: {
        eventId: EVENT_ID,
        userId: user.id,
        attendeeType: a.attendeeType,
        registrationStatus: "confirmed",
        // Pre-stamped so the seed-demo attendees show as already
        // approved in the admin queue (otherwise every seed-run would
        // pile 5 rows into "pending approval", which is noise).
        approvedAt: new Date(),
        includesSymposiumDay: true,
        paymentProvider: a.paymentProvider,
        paymentStatus: a.paymentStatus,
        amountCents: 0,
        currency: "CAD",
        qrToken: stableQrToken(EVENT_ID, user.id),
      },
      update: {
        attendeeType: a.attendeeType,
        registrationStatus: "confirmed",
        paymentProvider: a.paymentProvider,
        paymentStatus: a.paymentStatus,
      },
    });

    attendeeUsers.push({ id: user.id, email: user.email, name: user.name ?? a.name });
  }
  console.log(`  • ${ATTENDEES.length} demo attendees + Registrations upserted`);

  // 8. Demo WorkshopBookings — exercise every status the new flow
  //    supports: confirmed, waitlist, and the new pending-approval
  //    state. The latter gives the admin a row to click "Approve" on
  //    from /admin/events/2026-annual-symposium/registrations/[rid].
  const seedNow = new Date();
  await prisma.workshopBooking.upsert({
    where: { workshopId_userId: { workshopId: wsId("obio-bootcamp"), userId: attendeeUsers[0].id } },
    create: {
      workshopId: wsId("obio-bootcamp"),
      userId: attendeeUsers[0].id,
      status: "confirmed",
      approvedAt: seedNow,
    },
    update: {
      status: "confirmed",
      waitlistPosition: null,
      cancelledAt: null,
      approvedAt: seedNow,
    },
  });
  await prisma.workshopBooking.upsert({
    where: { workshopId_userId: { workshopId: wsId("agilis-medical-affairs"), userId: attendeeUsers[1].id } },
    create: {
      workshopId: wsId("agilis-medical-affairs"),
      userId: attendeeUsers[1].id,
      status: "confirmed",
      approvedAt: seedNow,
    },
    update: {
      status: "confirmed",
      waitlistPosition: null,
      cancelledAt: null,
      approvedAt: seedNow,
    },
  });
  // Demo pending booking — surfaces the admin "Approve" action.
  await prisma.workshopBooking.upsert({
    where: { workshopId_userId: { workshopId: wsId("omniabio-tour"), userId: attendeeUsers[3].id } },
    create: {
      workshopId: wsId("omniabio-tour"),
      userId: attendeeUsers[3].id,
      status: "pending",
      approvedAt: null,
    },
    update: {
      status: "pending",
      waitlistPosition: null,
      cancelledAt: null,
      approvedAt: null,
      approvedById: null,
    },
  });
  console.log("  • 3 demo WorkshopBookings upserted (2 confirmed, 1 pending — exercises the admin approval queue)");

  // 9. CL3 morning tour — 10 confirmed + 2 waitlist (capacity = 10)
  const cl3UserIds: string[] = [];
  for (let i = 1; i <= 12; i++) {
    const email = `cl3.waitlist.user${i}@biohubnet.test`;
    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        name: `CL3 Demo User ${i}`,
        password: passwordHash,
        role: "trainee",
        accountKind: "demo",
        isActive: true,
        emailVerified: new Date(),
      },
      update: {},
      select: { id: true },
    });

    await prisma.registration.upsert({
      where: { eventId_userId: { eventId: EVENT_ID, userId: user.id } },
      create: {
        eventId: EVENT_ID,
        userId: user.id,
        attendeeType: "trainee",
        registrationStatus: "confirmed",
        approvedAt: new Date(),
        paymentProvider: "free",
        paymentStatus: "waived",
        amountCents: 0,
        currency: "CAD",
        qrToken: stableQrToken(EVENT_ID, user.id),
      },
      update: {},
    });

    cl3UserIds.push(user.id);
  }

  // First 10 get CONFIRMED status; remaining 2 land on the waitlist
  // with positions 1 and 2.
  for (let i = 0; i < cl3UserIds.length; i++) {
    const isWaitlist = i >= 10;
    await prisma.workshopBooking.upsert({
      where: { workshopId_userId: { workshopId: wsId("cl3-tour-am"), userId: cl3UserIds[i] } },
      create: {
        workshopId: wsId("cl3-tour-am"),
        userId: cl3UserIds[i],
        status: isWaitlist ? "waitlist" : "confirmed",
        waitlistPosition: isWaitlist ? i - 9 : null,
        approvedAt: seedNow,
      },
      update: {
        status: isWaitlist ? "waitlist" : "confirmed",
        waitlistPosition: isWaitlist ? i - 9 : null,
        cancelledAt: null,
        approvedAt: seedNow,
      },
    });
  }
  console.log("  • CL3 morning tour: 10 confirmed + 2 waitlist demo bookings");

  // 10. PersonalAgendaEntry — 3 demo breakout picks
  const PERSONAL_AGENDA = [
    { userId: attendeeUsers[0].id, symposiumSessionId: ssId("breakout-a-innovation") },
    { userId: attendeeUsers[1].id, symposiumSessionId: ssId("breakout-b-storytelling") },
    { userId: attendeeUsers[2].id, symposiumSessionId: ssId("breakout-a-innovation") },
  ];

  for (const p of PERSONAL_AGENDA) {
    await prisma.personalAgendaEntry.upsert({
      where: { userId_symposiumSessionId: p },
      create: p,
      update: {},
    });
  }
  console.log(`  • ${PERSONAL_AGENDA.length} PersonalAgendaEntry rows upserted`);

  console.log("\n✅ Events seed complete.");
  console.log(`   Event: ${EVENT_SLUG}`);
  console.log(`   ${WORKSHOPS.length} workshops · ${SESSIONS.length} sessions · ${SPEAKERS.length} speakers · ${SPONSORS.length} sponsors`);
  console.log(`   ${ATTENDEES.length} demo attendees + 12 CL3-tour users (10 confirmed, 2 waitlist)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().then(() => process.exit(1));
  });
