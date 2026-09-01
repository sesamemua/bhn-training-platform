import type { CampaignProgram } from "./events";

export interface CampaignProgramConfig {
  slug: "engage" | "experience" | "venture-connect";
  program: CampaignProgram;
  name: string;
  eyebrow: string;
  title: string;
  summary: string;
  heroImage: string;
  heroImagePosition: string;
  audience: string;
  headlineFact: string;
  headlineFactLabel: string;
  gapHeading: string;
  gapBody: string;
  benefits: Array<{ title: string; body: string }>;
  roles: string[];
  roleNote: string;
  eligibilityDescription: string;
  steps: Array<{ title: string; body: string }>;
  roleHeading: string;
  roleBody: string;
  partners: string[];
  officialUrl: string;
  applicationPath: string;
  authRequired: boolean;
  primaryAction: string;
  contactEmail: string;
  disclaimer: string;
  publishedDeadline?: {
    at: string;
    label: string;
  };
}

export const CAMPAIGN_PROGRAMS: Record<CampaignProgramConfig["slug"], CampaignProgramConfig> = {
  engage: {
    slug: "engage",
    program: "engage",
    name: "ENGAGE",
    eyebrow: "Training Credits and curated pathways",
    title: "ENGAGE Training Credits",
    summary:
      "Academic knowledge is a strong start. ENGAGE helps eligible researchers add practical GMP, bioprocessing, regulatory and career skills through partner-delivered training.",
    heroImage: "https://biohubnet.ca/wp-content/uploads/biohubnet-engage/on-demand-learning.jpg",
    heroImagePosition: "center 38%",
    audience: "Master's and PhD students, postdocs, research associates and laboratory technicians",
    headlineFact: "Up to $5,000 CAD",
    headlineFactLabel: "in BioHubNet Training Credits after eligibility approval",
    gapHeading: "Turn research strength into industry-ready practice.",
    gapBody:
      "Graduate and laboratory work builds deep scientific judgment, but employers may also look for GMP, regulated workflows, manufacturing practice and industry context. BioHubNet funds eligible access, curates relevant options and gives trainees one place to move from approval to enrollment.",
    benefits: [
      {
        title: "Eligibility before course selection",
        body: "Confirm your institution and HQP category first, then apply once for Training Credits instead of starting with a provider checkout.",
      },
      {
        title: "A curated route into practical skills",
        body: "Explore pathways and courses spanning biomanufacturing, QA/QC, regulatory affairs, medical affairs, entrepreneurship and career development.",
      },
      {
        title: "Partner-delivered learning",
        body: "BioHubNet coordinates funding and access. Training is designed and delivered by specialist education and industry partners.",
      },
    ],
    roles: [
      "Master's or PhD student who has completed at least two semesters",
      "Postdoctoral fellow",
      "Research associate",
      "Laboratory technician",
      "Eligible Master's, PhD or postdoctoral trainee within one year of program or contract completion, through January 2027",
    ],
    roleNote: "Your STEM field must be relevant to biomanufacturing or the life sciences.",
    eligibilityDescription:
      "Check that your institution is in the current BioHubNet network. The application separately verifies your role, field and supporting documents.",
    steps: [
      {
        title: "Check your institution",
        body: "Use the current 41-institution network below before creating an account or starting a funding application.",
      },
      {
        title: "Apply for Training Credits",
        body: "Graduate students provide an unofficial transcript and enrollment verification. Postdocs, research associates and lab technicians provide an employment letter.",
      },
      {
        title: "Choose after approval",
        body: "Approved participants receive up to 5,000 course-access credits, then browse BioHubNet-curated options and open the delivery partner's learning system when enrolling.",
      },
    ],
    roleHeading: "BioHubNet funds access. Partners deliver the training.",
    roleBody:
      "BioHubNet is the funding, curation and access layer. Courses and pathways are delivered by organizations with subject-matter and industry expertise; direct course schedules and delivery remain with those partners.",
    partners: ["CASTL", "BioTalent Canada", "CATTI", "OBIO", "Agilis Health", "Seneca Polytechnic"],
    officialUrl: "https://biohubnet.ca/engage/",
    applicationPath: "/credits/apply",
    authRequired: true,
    primaryAction: "Apply for Training Credits",
    contactEmail: "info@biohubnet.ca",
    disclaimer:
      "Training Credits are awarded after eligibility review, expire 12 months after issuance and are used for eligible offerings in the BioHubNet platform.",
  },
  experience: {
    slug: "experience",
    program: "experience",
    name: "EXPERIENCE",
    eyebrow: "Industry internship talent community",
    title: "EXPERIENCE Industry Placements",
    summary:
      "Keep seeing 'industry experience required'? Build an employer-ready profile and join BioHubNet's reviewed talent pool for consideration for paid life-science and biomanufacturing placements.",
    heroImage:
      "https://biohubnet.ca/wp-content/uploads/2025/02/science-collaboration-and-experiment-with-a-team-2023-11-27-05-25-34-utc-1536x1025.jpg",
    heroImagePosition: "center 48%",
    audience: "Master's students, PhD students and postdoctoral fellows preparing for industry",
    headlineFact: "A reviewed talent pool",
    headlineFactLabel: "for potential paid industry placement matches across Canada",
    gapHeading: "You should not need a first industry job to become ready for one.",
    gapBody:
      "EXPERIENCE gives eligible academic candidates a structured way to translate research into an industry-facing profile. BioHubNet supports preparation, reviews the profile and may present approved candidates to relevant employers.",
    benefits: [
      {
        title: "Career-advisor support",
        body: "Strengthen a two-page resume, one-minute interview sample and concise elevator pitch before your profile enters the pool.",
      },
      {
        title: "Paid placement opportunities",
        body: "Approved candidates can be considered for compensated placements with biomanufacturing and life-science employers.",
      },
      {
        title: "Employer matching",
        body: "BioHubNet uses candidate and opportunity information to identify relevant matches and possible interview invitations.",
      },
    ],
    roles: [
      "Master's student",
      "PhD student",
      "Postdoctoral fellow",
      "Eligible Master's, PhD or postdoctoral trainee within one year of program or contract completion, through January 2027",
    ],
    roleNote:
      "Candidates must be able to work legally in Canada for the hours and duration required by an eventual placement.",
    eligibilityDescription:
      "Check your home institution first. Joining the talent pool also requires an eligible trainee category and a complete, reviewed candidate profile.",
    steps: [
      {
        title: "Check your institution",
        body: "Confirm current BioHubNet access before investing time in the talent-pool application.",
      },
      {
        title: "Build and refine your profile",
        body: "Submit your resume, interview sample and elevator pitch, then respond to career-advisor feedback where needed.",
      },
      {
        title: "Enter the pool after approval",
        body: "BioHubNet may share an approved profile with relevant employers. Employers decide whom to interview and hire.",
      },
    ],
    roleHeading: "BioHubNet prepares access to opportunities.",
    roleBody:
      "BioHubNet manages the talent-pool application, profile review, career support and matching layer. Employers own interview and hiring decisions, and eligible placements may use BioHubNet's Mitacs funding pathway.",
    partners: [],
    officialUrl: "https://biohubnet.ca/experience/",
    applicationPath: "/forms/talent-application",
    authRequired: true,
    primaryAction: "Join the talent pool",
    contactEmail: "info@biohubnet.ca",
    disclaimer:
      "Joining the talent pool does not guarantee an interview, employer match, placement or job. Availability depends on employer needs and program review.",
  },
  "venture-connect": {
    slug: "venture-connect",
    program: "venture_connect",
    name: "EQUIP VentureConnect",
    eyebrow: "Connection-building support for trainee founders",
    title: "EQUIP VentureConnect",
    summary:
      "The right investor, customer or commercialization partner may be in another city. Eligible trainee founders can apply for focused support to reach the conference, pitch event, workshop or meeting that moves a human-health venture forward.",
    heroImage: "https://biohubnet.ca/2/assets/home-program-equip.jpg",
    heroImagePosition: "center 48%",
    audience: "Graduate, postdoctoral and research-associate founders or venture leaders",
    headlineFact: "Up to $5,000 CAD",
    headlineFactLabel: "for eligible connection-building expenses",
    gapHeading: "Build the connection, not the operating budget.",
    gapBody:
      "VentureConnect is designed for a specific commercialization opportunity: documented investor meetings, pitch competitions, industry conferences, customer demos or justified entrepreneurship training. BioHubNet provides non-dilutive access support so eligible trainee founders can pursue those connections.",
    benefits: [
      {
        title: "Travel and accommodation",
        body: "Request eligible transportation and accommodation tied to one documented event or connection-building trip.",
      },
      {
        title: "Registration costs",
        body: "Conference, workshop or pitch-event registration can be included when it supports the stated commercialization purpose.",
      },
      {
        title: "Evidence-led review",
        body: "Show the meetings, invitation, agenda, registration information and cost estimates that support the request.",
      },
    ],
    roles: [
      "Master's or PhD student",
      "Postdoctoral fellow",
      "Scientific associate or research associate",
      "Innovation or commercialization fellow considered case by case",
      "Founder or venture leader working on a biomanufacturing or life-science innovation with clear human-health application",
    ],
    roleNote:
      "Customer demos and entrepreneurship training are reviewed case by case and need a clear commercialization rationale.",
    eligibilityDescription:
      "VentureConnect is currently available across the 41-institution BioHubNet network. The full application verifies your role, venture fit and supporting evidence.",
    steps: [
      {
        title: "Check your institution",
        body: "Core partner institutions have full access; expansion institutions have published VentureConnect access through January 2027.",
      },
      {
        title: "Document the opportunity",
        body: "Describe one event or trip and attach the meeting, invitation, agenda, registration and cost evidence that applies.",
      },
      {
        title: "Submit for review",
        body: "BioHubNet reviews the venture's human-health fit, the connection-building rationale, eligible costs and available funding.",
      },
    ],
    roleHeading: "BioHubNet supports the connection-building step.",
    roleBody:
      "BioHubNet provides the application, eligibility review and funding layer. Conferences, workshops, investor meetings and pitch events are run by external organizations; applicants choose and justify the opportunity that fits their venture.",
    partners: [],
    officialUrl: "https://biohubnet.ca/equip",
    applicationPath: "/apply/venture-connect",
    authRequired: false,
    primaryAction: "Start a VentureConnect application",
    contactEmail: "equip@biohubnet.ca",
    disclaimer:
      "Meals are not covered. VentureConnect is not for general operating expenses or company salaries, and an application is not a promise of funding.",
    publishedDeadline: {
      at: "2026-09-24T16:00:00.000Z",
      label: "September 24, 2026 at noon ET",
    },
  },
};

export function getCampaignProgram(slug: string): CampaignProgramConfig | null {
  return CAMPAIGN_PROGRAMS[slug as CampaignProgramConfig["slug"]] ?? null;
}

export function activePublishedDeadline(
  program: CampaignProgramConfig,
  now: Date = new Date(),
): CampaignProgramConfig["publishedDeadline"] | null {
  if (!program.publishedDeadline) return null;
  return new Date(program.publishedDeadline.at).getTime() >= now.getTime()
    ? program.publishedDeadline
    : null;
}
