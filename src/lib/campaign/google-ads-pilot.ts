import { CAMPAIGN_ATTRIBUTION_KEYS } from "./attribution";
import { CAMPAIGN_EVENT_NAMES } from "./events";
import { CAMPAIGN_PROGRAMS } from "./programs";

export type GoogleAdsPilotStatus = "implemented" | "approval_required";

export interface GoogleAdsPilotProgram {
  id: "engage" | "experience" | "venture-connect";
  name: string;
  campaignName: string;
  objective: string;
  audience: string;
  monthlyBudgetCad: number;
  dailyBudgetCad: number;
  keywordCount: number;
  negativeKeywordCount: number;
  responsiveSearchAdCount: number;
  adGroups: readonly string[];
  utmCampaign: string;
  landingPath: string;
  applicationPath: string;
  primaryConversion: string;
  status: "Paused";
}

export const GOOGLE_ADS_PILOT_PROGRAMS: readonly GoogleAdsPilotProgram[] = [
  {
    id: "engage",
    name: CAMPAIGN_PROGRAMS.engage.name,
    campaignName: "BHN | Search | ENGAGE | EN",
    objective: "Training Credit applications",
    audience: "Eligible Master's and PhD students, postdocs, research associates and lab technicians",
    monthlyBudgetCad: 300,
    dailyBudgetCad: 9.86,
    keywordCount: 17,
    negativeKeywordCount: 13,
    responsiveSearchAdCount: 3,
    adGroups: ["Training Credits", "Industry Training", "Learning Pathways"],
    utmCampaign: "bhn_search_engage_en",
    landingPath: "/for-trainees/engage",
    applicationPath: CAMPAIGN_PROGRAMS.engage.applicationPath,
    primaryConversion: CAMPAIGN_EVENT_NAMES.engageApplicationSubmitted,
    status: "Paused",
  },
  {
    id: "experience",
    name: CAMPAIGN_PROGRAMS.experience.name,
    campaignName: "BHN | Search | EXPERIENCE | EN",
    objective: "Talent-pool applications",
    audience: "Eligible Master's and PhD students and postdocs preparing for industry",
    monthlyBudgetCad: 180,
    dailyBudgetCad: 5.92,
    keywordCount: 18,
    negativeKeywordCount: 10,
    responsiveSearchAdCount: 3,
    adGroups: ["Industry Internships", "Talent Community", "Knowledge Exchange"],
    utmCampaign: "bhn_search_experience_en",
    landingPath: "/for-trainees/experience",
    applicationPath: CAMPAIGN_PROGRAMS.experience.applicationPath,
    primaryConversion: CAMPAIGN_EVENT_NAMES.experienceApplicationSubmitted,
    status: "Paused",
  },
  {
    id: "venture-connect",
    name: CAMPAIGN_PROGRAMS["venture-connect"].name,
    campaignName: "BHN | Search | EQUIP VC | EN",
    objective: "VentureConnect applications",
    audience: "Eligible trainee founders with human-health and life-science ventures",
    monthlyBudgetCad: 120,
    dailyBudgetCad: 3.95,
    keywordCount: 16,
    negativeKeywordCount: 12,
    responsiveSearchAdCount: 3,
    adGroups: ["VentureConnect Grant", "Biotech Founder Funding", "Conference and Pitch Support"],
    utmCampaign: "bhn_search_equip_vc_en",
    landingPath: "/for-trainees/venture-connect",
    applicationPath: CAMPAIGN_PROGRAMS["venture-connect"].applicationPath,
    primaryConversion: CAMPAIGN_EVENT_NAMES.ventureConnectApplicationSubmitted,
    status: "Paused",
  },
];

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
  { label: "Launch keywords", count: 51, source: "keywords.csv" },
  { label: "Negative keywords", count: 35, source: "negative-keywords.csv" },
  { label: "Paused responsive search ads", count: 9, source: "responsive-search-ads.csv" },
  { label: "Cost-planning rows", count: 51, source: "keyword-cost-planning-estimates.csv" },
] as const;

export const GOOGLE_ADS_LAUNCH_GATES: readonly {
  title: string;
  detail: string;
  status: GoogleAdsPilotStatus;
}[] = [
  {
    title: "Campaign landing experiences",
    detail: "ENGAGE, EXPERIENCE and VentureConnect use the platform design system and existing application workflows.",
    status: "implemented",
  },
  {
    title: "Eligibility before application",
    detail: "Each landing route checks the current 41-institution network before presenting its main application action.",
    status: "implemented",
  },
  {
    title: "Attribution continuity",
    detail: "Supported UTM and Google click identifiers survive authentication, drafts and submission hand-offs.",
    status: "implemented",
  },
  {
    title: "Submission conversion events",
    detail: "Primary application conversions are recorded only after their corresponding database write succeeds.",
    status: "implemented",
  },
  {
    title: "Production publication",
    detail: "Approve the production push and verify all three landing routes on the live domain.",
    status: "approval_required",
  },
  {
    title: "Google Ads and analytics mapping",
    detail: "Approve the destination account, conversion IDs and consent-mode validation before importing assets.",
    status: "approval_required",
  },
  {
    title: "Billing and campaign activation",
    detail: "Keep campaigns paused until live conversion tests pass; billing and activation require explicit approval.",
    status: "approval_required",
  },
];

export const GOOGLE_ADS_PILOT = {
  name: "English Google Search pilot",
  status: "Draft - not live",
  network: "Google Search only",
  language: "English",
  locations: ["Toronto / GTA", "Greater Montréal"],
  locationMode: "Presence only",
  excludedNetworks: ["Search Partners", "Display Network"],
  monthlyBudgetCad: 600,
  dailyBudgetCad: 19.73,
  attributionKeys: CAMPAIGN_ATTRIBUTION_KEYS,
  lastVerifiedOn: "September 1, 2026",
} as const;
