import type { GoogleAdsPlan, GoogleAdsKeyword, GoogleAdsNegative } from "./google-ads-workspace";
import {
  GOOGLE_ADS_ACTIVE_KEYWORDS,
  GOOGLE_ADS_CAMPAIGN_NEGATIVES,
  GOOGLE_ADS_PILOT,
  GOOGLE_ADS_PROMOTION,
  GOOGLE_ADS_CONVERSION_EVENTS,
} from "./google-ads-pilot";

/**
 * Recommended editable draft, researched 4 September 2026.
 * The imported pilot constants remain the immutable historical Google Ads baseline.
 * Saving this plan never changes the Google Ads account.
 */
const PROGRAM_DETAILS: Array<Omit<GoogleAdsPlan["programs"][number], "keywords" | "negatives">> = [
  {
    "id": "engage",
    "name": "ENGAGE",
    "audience": "Master's and PhD students, postdocs and eligible research staff in life sciences, biotech and related STEM. Direct-address variants for U of T, TMU, York and McGill; program eligibility still applies.",
    "intent": "Build practical industry skills without paying for another full credential; find funded training relevant to a biotech career.",
    "objective": "Completed ENGAGE training-credit applications and course enrollments",
    "landingUrl": "/for-trainees/engage",
    "notes": "Proposed draft. Credits are course-access currency worth up to CAD $5,000, not cash. Graduate students must have completed at least two semesters. Use one institution per ad and match institution-specific copy to relevant searches. Do not combine this offer with a guaranteed internship. Sources checked 4 September 2026: https://biohubnet.ca/engage/",
    "ads": [
      {
        "id": "engage-utoronto",
        "label": "University of Toronto — ENGAGE",
        "institution": "University of Toronto",
        "headlines": [
          "U of T Science Grad Students",
          "Up to $5,000 Training Credit",
          "Build Your Biotech Skills",
          "Master's and PhD Training"
        ],
        "descriptions": [
          "U of T master's and PhD students: build industry skills with eligible training credits.",
          "Apply for ENGAGE credits worth up to $5,000. Eligibility and course rules apply."
        ],
        "notes": "Proposed copy only. Use for relevant institution-specific searches; university name in an ad does not enforce enrollment targeting. Eligibility applies."
      },
      {
        "id": "engage-mcgill",
        "label": "McGill University — ENGAGE",
        "institution": "McGill University",
        "headlines": [
          "McGill Science Grad Students",
          "Up to $5,000 Training Credit",
          "Build Industry-Ready Skills",
          "Explore ENGAGE Training"
        ],
        "descriptions": [
          "McGill master's and PhD students: build biotech skills with eligible training credits.",
          "Apply for ENGAGE credits worth up to $5,000. Check eligibility and course availability."
        ],
        "notes": "Proposed copy only. Use for relevant institution-specific searches; university name in an ad does not enforce enrollment targeting. Eligibility applies."
      },
      {
        "id": "engage-tmu",
        "label": "Toronto Metropolitan University — ENGAGE",
        "institution": "Toronto Metropolitan University",
        "headlines": [
          "TMU Science Grad Students",
          "Up to $5,000 Training Credit",
          "Prepare for Biotech Careers",
          "Explore ENGAGE Training"
        ],
        "descriptions": [
          "TMU master's and PhD students: build skills for biomanufacturing and life science careers.",
          "Apply for ENGAGE credits worth up to $5,000. Check eligibility and course availability."
        ],
        "notes": "Proposed copy only. Use for relevant institution-specific searches; university name in an ad does not enforce enrollment targeting. Eligibility applies."
      },
      {
        "id": "engage-york",
        "label": "York University — ENGAGE",
        "institution": "York University",
        "headlines": [
          "York Science Grad Students",
          "Up to $5,000 Training Credit",
          "Build Your Biotech Skills",
          "Explore ENGAGE Training"
        ],
        "descriptions": [
          "York master's and PhD students: build industry skills with eligible training credits.",
          "Apply for ENGAGE credits worth up to $5,000. Eligibility and course rules apply."
        ],
        "notes": "Proposed copy only. Use for relevant institution-specific searches; university name in an ad does not enforce enrollment targeting. Eligibility applies."
      },
      {
        "id": "engage-utoronto-careers",
        "label": "U of T — industry career angle",
        "institution": "University of Toronto",
        "headlines": [
          "U of T Life Science Grads",
          "Move From Lab to Industry",
          "Up to $5,000 Training Credit",
          "Explore Career-Based Training"
        ],
        "descriptions": [
          "U of T master's or PhD student? Build biotech skills for your next industry career step.",
          "Explore training credits worth up to $5,000. Apply for ENGAGE to check your eligibility."
        ],
        "notes": "Proposed copy only. Use for relevant institution-specific searches; university name in an ad does not enforce enrollment targeting. Eligibility applies."
      }
    ]
  },
  {
    "id": "experience",
    "name": "EXPERIENCE",
    "audience": "Master's and PhD students and postdocs in life sciences, biotech and related STEM at eligible institutions. U of T, McGill and Université de Montréal variants address graduate trainees directly.",
    "intent": "Find a biotech internship or first industry experience and get help presenting academic experience to employers.",
    "objective": "Completed EXPERIENCE talent-pool applications",
    "landingUrl": "/for-trainees/experience",
    "notes": "Proposed draft. Joining the talent pool does not guarantee an interview, job or placement. Keep job, internship and mixed training/career searches eligible. Applicant and work eligibility apply. Source checked 4 September 2026: https://biohubnet.ca/experience/",
    "ads": [
      {
        "id": "experience-utoronto",
        "label": "University of Toronto — EXPERIENCE",
        "institution": "University of Toronto",
        "headlines": [
          "U of T Master's and PhDs",
          "Need Biotech Experience?",
          "Explore Paid Internships",
          "Join the Industry Talent Pool"
        ],
        "descriptions": [
          "U of T life science grad students: explore internships and build your industry profile.",
          "Join the industry talent pool. Interviews and placements are not guaranteed."
        ],
        "notes": "Proposed copy only. Use for relevant institution-specific searches; university name in an ad does not enforce enrollment targeting. Eligibility applies."
      },
      {
        "id": "experience-udem",
        "label": "Université de Montréal — EXPERIENCE",
        "institution": "Université de Montréal",
        "headlines": [
          "UdeM Master's and PhD Students",
          "Explore Biotech Internships",
          "Build Your Industry Profile",
          "Join the Industry Talent Pool"
        ],
        "descriptions": [
          "UdeM life science grad students: explore internships and prepare for industry interviews.",
          "Join the industry talent pool. Interviews and placements are not guaranteed."
        ],
        "notes": "Proposed copy only. Use for relevant institution-specific searches; university name in an ad does not enforce enrollment targeting. Eligibility applies."
      },
      {
        "id": "experience-mcgill",
        "label": "McGill University — EXPERIENCE",
        "institution": "McGill University",
        "headlines": [
          "McGill Master's and PhDs",
          "Need Biotech Experience?",
          "Explore Paid Internships",
          "Join the Industry Talent Pool"
        ],
        "descriptions": [
          "McGill life science grad students: explore internships and build your industry profile.",
          "Join the industry talent pool. Interviews and placements are not guaranteed."
        ],
        "notes": "Proposed copy only. Use for relevant institution-specific searches; university name in an ad does not enforce enrollment targeting. Eligibility applies."
      }
    ]
  },
  {
    "id": "venture-connect",
    "name": "EQUIP VentureConnect",
    "audience": "Graduate-student, postdoctoral and eligible research-associate founders or venture leaders working on early-stage life science innovations with a human-health application. U of T, McGill and Polytechnique Montréal variants.",
    "intent": "Find money for travel and event fees to meet investors, attend pitch events and build commercialization connections.",
    "objective": "Completed VentureConnect applications",
    "landingUrl": "/for-trainees/venture-connect",
    "notes": "Next intake opening soon (confirmed by team); prepare now, update CTA and intake date when published. Up to CAD $5,000 in eligible travel and event support. Applicant must be an eligible trainee entrepreneur; being a CEO alone is insufficient. Montreal expansion institutions have VentureConnect access through January 2027. Funding and eligibility source checked 4 September 2026: https://biohubnet.ca/equip/",
    "ads": [
      {
        "id": "connect-utoronto",
        "label": "University of Toronto — EQUIP VentureConnect",
        "institution": "University of Toronto",
        "headlines": [
          "U of T Biotech Founders",
          "Travel to Meet Investors",
          "Up to $5,000 Travel Support",
          "Explore VentureConnect"
        ],
        "descriptions": [
          "Building a life science venture at U of T? Explore eligible investor-event travel support.",
          "Graduate trainee founders: get help with approved travel and event fees. Terms apply."
        ],
        "notes": "Proposed copy only. Use for relevant institution-specific searches; university name in an ad does not enforce enrollment targeting. Eligibility applies."
      },
      {
        "id": "connect-mcgill",
        "label": "McGill University — EQUIP VentureConnect",
        "institution": "McGill University",
        "headlines": [
          "McGill Biotech Founders",
          "Meet Investors Beyond Campus",
          "Up to $5,000 Travel Support",
          "Explore VentureConnect"
        ],
        "descriptions": [
          "McGill graduate trainee building a health venture? Explore travel funds to meet investors.",
          "VentureConnect supports eligible travel and event fees. Check applicant and venture rules."
        ],
        "notes": "Proposed copy only. Use for relevant institution-specific searches; university name in an ad does not enforce enrollment targeting. Eligibility applies."
      },
      {
        "id": "connect-poly",
        "label": "École Polytechnique de Montréal — EQUIP VentureConnect",
        "institution": "École Polytechnique de Montréal",
        "headlines": [
          "Polytechnique Grad Founders",
          "Building a Health Venture?",
          "Up to $5,000 Travel Support",
          "Explore VentureConnect"
        ],
        "descriptions": [
          "Polytechnique grad founders: explore support for travel to industry and investor events.",
          "VentureConnect supports eligible travel and event fees. Check applicant and venture rules."
        ],
        "notes": "Proposed copy only. Use for relevant institution-specific searches; university name in an ad does not enforce enrollment targeting. Eligibility applies."
      }
    ]
  }
];

const INSTITUTION_KEYWORD_PROPOSALS: Record<string, string[]> = {
  "engage": [
    "funded biotech training u of t phd",
    "u of t science masters industry training",
    "mcgill phd biotech training funding",
    "tmu science graduate industry training",
    "york phd life science training funding"
  ],
  "experience": [
    "u of t phd biotech internship",
    "mcgill phd industry internship",
    "udem life science graduate internship"
  ],
  "venture-connect": [
    "u of t biotech founder travel funding",
    "mcgill startup investor travel grant",
    "polytechnique health startup travel funding"
  ]
};

const NEGATIVE_GROUPS: Array<{
  category: string;
  scope: string;
  matchType: GoogleAdsNegative["matchType"];
  terms: string[];
}> = [
  {
    "category": "School and degree admissions",
    "scope": "Campaign",
    "matchType": "phrase",
    "terms": [
      "elementary school",
      "middle school",
      "grade 11",
      "grade 12",
      "gcse biology",
      "a level biology",
      "ib biology",
      "mcat prep",
      "mcat preparation",
      "mcat tutoring",
      "ucat prep",
      "medical school admissions",
      "medical school admission",
      "nursing school admission",
      "undergraduate admissions",
      "undergraduate admission",
      "bachelor degree admission",
      "bachelors degree admission",
      "ouac application",
      "high school scholarship",
      "high school scholarships",
      "undergraduate scholarship",
      "undergraduate scholarships"
    ]
  },
  {
    "category": "Homework and exam answer intent",
    "scope": "Campaign",
    "matchType": "phrase",
    "terms": [
      "homework help",
      "assignment answers",
      "assignment answer",
      "exam answers",
      "exam answer",
      "quiz answers",
      "quiz answer",
      "answer key",
      "essay writing service",
      "biology tutor",
      "biology tutoring",
      "chemistry tutor",
      "chemistry tutoring"
    ]
  },
  {
    "category": "Unrelated borrowing and personal finance",
    "scope": "Campaign",
    "matchType": "phrase",
    "terms": [
      "payday loan",
      "payday loans",
      "debt consolidation",
      "mortgage rates",
      "mortgage calculator",
      "bad credit loan",
      "bad credit loans",
      "student loan repayment",
      "student loan repayments",
      "osap repayment",
      "credit card debt",
      "personal line of credit"
    ]
  },
  {
    "category": "Equipment shopping and household services",
    "scope": "Campaign",
    "matchType": "phrase",
    "terms": [
      "laboratory equipment for sale",
      "used lab equipment",
      "buy microscope",
      "buy microscopes",
      "petri dish price",
      "petri dish prices",
      "pipette price",
      "pipette prices",
      "reagent supplier",
      "reagent suppliers",
      "refrigerator repair",
      "appliance repair"
    ]
  },
  {
    "category": "Clearly unrelated venture sectors",
    "scope": "VentureConnect",
    "matchType": "phrase",
    "terms": [
      "salon startup grant",
      "salon startup grants",
      "trucking business grant",
      "trucking business grants",
      "dropshipping business",
      "franchise financing",
      "cryptocurrency investment",
      "real estate investing"
    ]
  },
  {
    "category": "Protect partner/provider navigation only",
    "scope": "ENGAGE",
    "matchType": "exact",
    "terms": [
      "catti",
      "castl",
      "obio",
      "cantrain",
      "seneca regulatory affairs",
      "catti courses",
      "castl courses",
      "obio courses"
    ]
  },
  {
    "category": "Unrelated job intent only",
    "scope": "EXPERIENCE",
    "matchType": "phrase",
    "terms": [
      "cashier jobs",
      "cashier job",
      "retail jobs",
      "retail job",
      "delivery driver jobs",
      "delivery driver job",
      "warehouse picker jobs",
      "warehouse picker job"
    ]
  }
];

function stableDraftId(prefix: string, value: string) {
  return (prefix + "-" + value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")).slice(0, 100);
}

function draftKeyword(programId: string, raw: string, institutionProposal = false): GoogleAdsKeyword {
  const matchType = raw.startsWith("[") || institutionProposal ? "exact" : "phrase";
  const text = raw.replace(/^["\[]|["\]]$/g, "");
  return {
    id: stableDraftId("kw-" + programId + "-" + matchType, text),
    text,
    matchType,
    competition: "Not verified",
    costNote: institutionProposal
      ? "Keyword Planner estimate needed. New institution-specific proposal; demand not verified."
      : "Keyword Planner estimate needed. Retained from the historical pilot keyword list.",
  };
}

function draftNegatives(scope: string): GoogleAdsNegative[] {
  return NEGATIVE_GROUPS.filter((group) => group.scope === scope).flatMap((group) =>
    group.terms.map((text) => ({
      id: stableDraftId("neg-" + scope.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + group.matchType, text),
      text,
      matchType: group.matchType,
      reason: group.category + ". Proposed exclusion; review search terms before applying.",
    })),
  );
}

export function createDefaultGoogleAdsPlan(): GoogleAdsPlan {
  const brandNegatives: GoogleAdsNegative[] = GOOGLE_ADS_CAMPAIGN_NEGATIVES
    .filter((text) => text.startsWith("bio"))
    .map((text) => ({
      id: stableDraftId("neg-campaign-brand", text),
      text,
      matchType: text === "biohubnet" ? "broad" : "phrase",
      reason: "User-requested brand exclusion: avoid paying for BioHubNet navigation clicks.",
    }));

  return {
    name: GOOGLE_ADS_PILOT.name + " — working draft",
    strategy: "Prepare ENGAGE training, EXPERIENCE internships and VentureConnect founder travel within the CA$600/month English Search plan. Test institution-specific wording within the relevant program intent; create university-specific ad groups only when search demand supports them. The team confirms VentureConnect is opening soon. Any separate founder campaign must reallocate within the CA$600 total.",
    settings: {
      monthlyBudgetCad: GOOGLE_ADS_PILOT.monthlyBudgetCad,
      dailyBudgetCad: GOOGLE_ADS_PILOT.dailyBudgetCad,
      maximumCpcCad: GOOGLE_ADS_PILOT.maximumCpcCad,
      locations: GOOGLE_ADS_PILOT.locations.join("; "),
      language: GOOGLE_ADS_PILOT.language,
      network: GOOGLE_ADS_PILOT.network,
      bidding: GOOGLE_ADS_PILOT.bidding,
      locationMode: GOOGLE_ADS_PILOT.locationMode,
      automation: "Phrase and exact positive keywords; no broad match, AI Max, Display or Search Partners. These are the recorded pilot settings, last verified " + GOOGLE_ADS_PILOT.lastVerifiedOn + ", not a fresh account inspection.",
    },
    programs: PROGRAM_DETAILS.map((program) => {
      const retained = program.id in GOOGLE_ADS_ACTIVE_KEYWORDS
        ? GOOGLE_ADS_ACTIVE_KEYWORDS[program.id as keyof typeof GOOGLE_ADS_ACTIVE_KEYWORDS]
        : [];
      const negatives = draftNegatives(
        program.id === "engage" ? "ENGAGE"
          : program.id === "experience" ? "EXPERIENCE"
            : "VentureConnect",
      ).map((negative) => ({ ...negative, id: stableDraftId("neg-" + program.id + "-" + negative.matchType, negative.text) }));
      return {
        ...program,
        ads: program.ads.map((ad) => ({ ...ad, headlines: [...ad.headlines], descriptions: [...ad.descriptions] })),
        keywords: [
          ...retained.map((text) => draftKeyword(program.id, text)),
          ...(INSTITUTION_KEYWORD_PROPOSALS[program.id] ?? []).map((text) => draftKeyword(program.id, text, true)),
        ],
        negatives,
      };
    }),
    campaignNegatives: [
      ...brandNegatives,
      {
        id: "neg-campaign-brand-full-name",
        text: "biomanufacturing hub network",
        matchType: "phrase",
        reason: "Exclude the full BioHubNet brand name from paid navigation clicks.",
      },
      ...draftNegatives("Campaign"),
    ],
    notes: [
      {
        id: "draft-status",
        title: "Working plan, not live Google Ads",
        body: "All additions, removals and ad variants here are proposed. Saving records the plan and its change history; it does not publish changes or enable ads. Export the plan, comments and changes to Codex for account review and implementation.",
      },
      {
        id: "historical-baseline",
        title: "Recorded campaign setup",
        body: "Last account verification: " + GOOGLE_ADS_PILOT.lastVerifiedOn + ". Campaign " + GOOGLE_ADS_PILOT.campaignId + " in " + GOOGLE_ADS_PILOT.account + " was recorded as " + GOOGLE_ADS_PILOT.status + " with CA$" + GOOGLE_ADS_PILOT.spendCad + " spend. Recorded settings: CA$600/month, CA$19.73/day, Maximize clicks with CA$4 maximum CPC, English, GTA and Montreal, Google Search only and presence targeting. This is historical context and must not be presented as a fresh live check.",
      },
      {
        id: "historical-promotion",
        title: "Recorded Google Ads credit offer",
        body: GOOGLE_ADS_PROMOTION.offer + ". Recorded " + GOOGLE_ADS_PROMOTION.status + "; redeemed " + GOOGLE_ADS_PROMOTION.redeemedOn + ", requirements due " + GOOGLE_ADS_PROMOTION.requirementsDueOn + ". Credit use period recorded as " + GOOGLE_ADS_PROMOTION.useWithinDays + " days. Historical baseline only; verify current eligibility, spend and deadlines in Google Ads.",
      },
      {
        id: "historical-conversions",
        title: "Recorded conversion setup",
        body: "Historical baseline: " + GOOGLE_ADS_CONVERSION_EVENTS.filter((event) => event.classification === "Primary").map((event) => event.name).join(", ") + " were designed as server-confirmed primary application events. Production conversion labels and completed-application tests were still launch requirements in that baseline. Verify actual deployment and measurement status before enabling spend.",
      },
      {
        id: "negative-keyword-review",
        title: "Narrow negatives to protect valid applicants",
        body: "The proposed draft replaces broad nursing, medical-school, undergraduate and bachelor exclusions with specific admission phrases. It removes blanket jobs/internship negatives from ENGAGE and course/travel-grant blocks from relevant groups. Keep free, funded, grant, student, medicine, PhD, training, jobs, internships and eligible university names available. Keep the recorded baseline separate; these changes have not been applied to Google Ads. Negative rules: https://support.google.com/google-ads/answer/2453972?hl=en",
      },
      {
        id: "funding-and-institutions",
        title: "Funding and institution rules",
        body: "Funding and eligibility verified 4 September 2026: ENGAGE offers course-access credits worth up to CA$5,000. EXPERIENCE is a talent-pool application, not a guaranteed job. VentureConnect offers up to CA$5,000 for eligible travel and event costs. Its next intake is opening soon, confirmed by the team; prepare now and update CTA/date when published. U of T, TMU and York are core institutions; McGill, Université de Montréal and Polytechnique Montréal have expansion access through January 2027. Sources: https://biohubnet.ca/engage/ | https://biohubnet.ca/experience/ | https://biohubnet.ca/equip/ | https://biohubnet.ca/wp-content/uploads/biohubnet-shared/biohubnet-institutions.js?v=20260710w",
      },
      {
        id: "institution-messaging",
        title: "Use one university per ad",
        body: "U of T, TMU, York, McGill, UdeM and Polytechnique wording addresses verified institutional audiences. Use one university per RSA and pair it with relevant institution-specific queries; university names in ad copy do not restrict serving to enrolled students. Applicant eligibility checks remain necessary. Use general graduate-student wording for generic queries. Concordia University in Montreal is not in the published list; do not confuse it with Concordia University of Edmonton.",
      },
      {
        id: "partner-costs",
        title: "Avoid competing for provider navigation",
        body: "Keep BioHubNet terms negative and avoid provider-brand bidding. Provider negatives are exact-only navigation terms, so funding-related searches can remain eligible. Long-tail terms focus on the student's funding, career or founder need; they do not guarantee lower CPC. Keyword competition and CPC are unverified until Keyword Planner/account data is available. A provider appearing in organic results does not prove it buys Google Ads.",
      },
      {
        id: "budget-and-expansion",
        title: "Keep the total budget at CA$600",
        body: "Prepare the three program intent groups: ENGAGE, EXPERIENCE and VentureConnect. Do not split the small budget into a campaign per university. A separate founder campaign can accommodate distinct dates and intent, with reallocation within the existing CA$600 total. No extra spend is included in this draft.",
      },
    ],
  };
}
