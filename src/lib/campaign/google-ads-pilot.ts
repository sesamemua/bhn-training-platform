import { CAMPAIGN_ATTRIBUTION_KEYS } from "./attribution";
import { CAMPAIGN_EVENT_NAMES } from "./events";
import { CAMPAIGN_PROGRAMS } from "./programs";

export type GoogleAdsPilotStatus = "implemented" | "approval_required";

export interface GoogleAdsPilotProgram {
  id: "engage" | "experience" | "venture-connect";
  name: string;
  objective: string;
  audience: string;
  intent: string;
  keywordCount: number;
  adGroupNegativeCount: number;
  responsiveSearchAdCount: number;
  landingPath: string;
  applicationPath: string;
  primaryConversion: string;
  status: "Paused";
}

export const GOOGLE_ADS_PILOT_PROGRAMS: readonly GoogleAdsPilotProgram[] = [
  {
    id: "engage",
    name: CAMPAIGN_PROGRAMS.engage.name,
    objective: "ENGAGE applications",
    audience: "Master’s, PhD and postdoc trainees in life science, biotech, STEM and medicine",
    intent: "Find funded skills training, course credits, GMP or regulatory training",
    keywordCount: 10,
    adGroupNegativeCount: 5,
    responsiveSearchAdCount: 1,
    landingPath: "/for-trainees/engage",
    applicationPath: CAMPAIGN_PROGRAMS.engage.applicationPath,
    primaryConversion: CAMPAIGN_EVENT_NAMES.engageApplicationSubmitted,
    status: "Paused",
  },
  {
    id: "experience",
    name: CAMPAIGN_PROGRAMS.experience.name,
    objective: "EXPERIENCE applications",
    audience: "Master’s, PhD and postdoc trainees in life science, biotech, STEM and medicine",
    intent: "Find a biotech job, internship, placement or first industry experience",
    keywordCount: 10,
    adGroupNegativeCount: 5,
    responsiveSearchAdCount: 1,
    landingPath: "/for-trainees/experience",
    applicationPath: CAMPAIGN_PROGRAMS.experience.applicationPath,
    primaryConversion: CAMPAIGN_EVENT_NAMES.experienceApplicationSubmitted,
    status: "Paused",
  },
  {
    id: "venture-connect",
    name: CAMPAIGN_PROGRAMS["venture-connect"].name,
    objective: "VentureConnect applications",
    audience: "Life-science founders and trainee entrepreneurs with an early-stage venture",
    intent: "Find travel funding to meet investors, VCs or attend an investor conference",
    keywordCount: 11,
    adGroupNegativeCount: 5,
    responsiveSearchAdCount: 1,
    landingPath: "/for-trainees/venture-connect",
    applicationPath: CAMPAIGN_PROGRAMS["venture-connect"].applicationPath,
    primaryConversion: CAMPAIGN_EVENT_NAMES.ventureConnectApplicationSubmitted,
    status: "Paused",
  },
];

export const GOOGLE_ADS_ACTIVE_KEYWORDS = {
  engage: [
    '"life science training credits for phd students"',
    '"funded gmp training for phd students"',
    '"funded biotech training for postdocs canada"',
    '"industry training funding for graduate students"',
    '"funded regulatory affairs training for phd students"',
    '"biotech training credits for masters students"',
    "[funded gmp training for phd students]",
    "[funded biotech training for postdocs canada]",
    "[industry training funding for graduate students]",
    "[life science training credits for phd students]",
  ],
  experience: [
    '"postdoc industry internship"',
    '"phd biotech internship"',
    '"biotech jobs without industry experience"',
    '"biotech internship toronto"',
    '"biotech internship montreal"',
    '"life science internship for phd students"',
    "[postdoc industry internship]",
    "[phd biotech internship]",
    "[biotech internship toronto]",
    "[biotech internship montreal]",
  ],
  "venture-connect": [
    '"founder travel funding"',
    '"investor conference grant"',
    '"conference travel grant canada"',
    '"trainee entrepreneur grant"',
    '"biotech startup travel grant"',
    '"funding to meet venture capitalists"',
    '"life science startup investor conference funding"',
    "[founder travel funding]",
    "[investor conference grant]",
    "[conference travel grant canada]",
    "[trainee entrepreneur grant]",
  ],
} as const;

export const GOOGLE_ADS_CAMPAIGN_NEGATIVES = [
  "biohubnet",
  "bio hub net",
  "biohub net",
  "bio hubnet",
  "biohub network",
  "bio hub network",
  "undergraduate",
  "bachelor",
  "high school",
  "medical school",
  "nursing",
  "homework",
  "wikipedia",
  "definition",
  "personal loan",
  "business loan",
  "travel agency",
  "vacation",
  "restaurant startup",
  "real estate startup",
] as const;

export const GOOGLE_ADS_AD_GROUP_NEGATIVES = {
  engage: ["jobs", "internship", "startup funding", "travel grant", "life sciences career training"],
  experience: ["course", "courses", "training credits", "startup grant", "travel grant"],
  "venture-connect": ["jobs", "internship", "course", "courses", "student scholarship"],
} as const;

export const GOOGLE_ADS_CONVERSION_EVENTS = [
  {
    name: CAMPAIGN_EVENT_NAMES.ctaClick,
    stage: "Application intent",
    classification: "Secondary",
    confirmation: "Consent-aware browser event",
    trigger: "A campaign application action is selected",
  },
  {
    name: CAMPAIGN_EVENT_NAMES.eligibilityComplete,
    stage: "Eligibility",
    classification: "Secondary",
    confirmation: "Consent-aware browser event",
    trigger: "An institution result is returned",
  },
  {
    name: CAMPAIGN_EVENT_NAMES.engageApplicationSubmitted,
    stage: "ENGAGE application",
    classification: "Primary",
    confirmation: "Server-confirmed",
    trigger: "A Training Credit application is stored successfully",
  },
  {
    name: CAMPAIGN_EVENT_NAMES.experienceApplicationSubmitted,
    stage: "EXPERIENCE application",
    classification: "Primary",
    confirmation: "Server-confirmed",
    trigger: "A talent-pool application is stored successfully",
  },
  {
    name: CAMPAIGN_EVENT_NAMES.ventureConnectApplicationSubmitted,
    stage: "VentureConnect application",
    classification: "Primary",
    confirmation: "Server-confirmed",
    trigger: "A VentureConnect application is stored successfully",
  },
] as const;

export const GOOGLE_ADS_PILOT_ASSETS = [
  { label: "Active keywords", count: 31, source: "Google Ads" },
  { label: "Negative keywords", count: 35, source: "Google Ads" },
  { label: "Responsive search ads", count: 3, source: "Google Ads" },
  { label: "Paused old ENGAGE keywords", count: 12, source: "Google Ads" },
] as const;

export const GOOGLE_ADS_PROMOTION = {
  offer: "Spend CA$600 and receive CA$600 in Google Ads credit",
  status: "Redeemed — requirements not yet complete",
  redeemedOn: "September 2, 2026",
  requirementsDueOn: "November 1, 2026",
  useWithinDays: 60,
} as const;

export const GOOGLE_ADS_LAUNCH_GATES: readonly {
  title: string;
  detail: string;
  status: GoogleAdsPilotStatus;
}[] = [
  {
    title: "Google Ads campaign setup",
    detail: "Campaign, ad groups, keywords, negatives, ads, billing and promotion are configured.",
    status: "implemented",
  },
  {
    title: "Campaign landing experiences",
    detail: "ENGAGE, EXPERIENCE and VentureConnect use the platform application workflows.",
    status: "implemented",
  },
  {
    title: "Attribution continuity",
    detail: "Supported UTM and Google click identifiers survive authentication, drafts and submission hand-offs.",
    status: "implemented",
  },
  {
    title: "Production conversion tracking",
    detail: "Deploy the Google Ads conversion labels, then test all three completed-application events.",
    status: "approval_required",
  },
  {
    title: "Campaign activation",
    detail: "Keep the campaign paused until conversion tests pass and launch is approved.",
    status: "approval_required",
  },
];

export const GOOGLE_ADS_PILOT = {
  name: "BioHubNet Applications | GTA + Montreal | Search",
  campaignId: "24204276639",
  account: "info@biohubnet.ca",
  status: "Paused",
  spendCad: 0,
  network: "Google Search only",
  language: "English",
  locations: ["Greater Toronto Area, Ontario", "Montreal, Quebec"],
  locationMode: "Presence only",
  excludedNetworks: ["Search Partners", "Display Network"],
  monthlyBudgetCad: 600,
  dailyBudgetCad: 19.73,
  bidding: "Maximize clicks",
  maximumCpcCad: 4,
  broadMatch: false,
  aiMax: false,
  conversionGoal: "Submit lead forms",
  attributionKeys: CAMPAIGN_ATTRIBUTION_KEYS,
  lastVerifiedOn: "September 3, 2026",
} as const;
