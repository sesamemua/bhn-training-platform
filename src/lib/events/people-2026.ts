import type { PlanPerson } from "./people-plan";

// Names and affiliations on the official event pages, checked 2026-10-07.
// An event association is not a claim of attendance or a new invitation.
const symposium = [
  ["Christopher Procyshyn", "Vanrx Pharmasystems", "Former CEO"],
  ["Morgan Cramm", "OmniaBio", "Senior Director of Operations"],
  ["Dimitrije Jankovic", "Sanofi", "Global Head of Digital Strategy and Operations, Global SVP"],
  ["Mona Abu Nameh", "AstraZeneca", "CMC Regulatory Affairs Manager"],
  ["Angela Davoud", "Peak R&D", "Founder, CGO"],
  ["Jasmine Hamilton", "Health Emergency Readiness Canada", "Senior Advisor"],
  ["Sven Ansorge", "CASTL", "Director, Technical Training and Innovation"],
  ["Geoff Evans", "Eurofins CDMO Alphora Inc.", "President"],
  ["Yannick Dupe", "Sanofi", "Head of Site Operational Excellence & Smart Factory"],
];
const insights = [
  ["Abhaya Khulbe", "AmacaThera", "Chief of Staff"],
  ["Jessica Bond", "OmniaBio", "Senior Manager, Talent Acquisition"],
  ["Chris Czaniecki", "Agilis Health", "Vice President"],
  ["Danielle Furtado", "AstraZeneca", "Talent Acquisition Partner"],
  ["Jeffrey Seres", "Eurofins CDMO Alphora Inc.", "Manager, Technology Transfer"],
  ["Sagar Lahiri", "Spectral Medical", "Manager, Reagent Manufacturing"],
  ["Ben Kolisnyk", "Bough Biosciences", "CEO"],
  ["Marta Verby", "Deep Genomics", "Senior Director of Scientific Operations"],
  ["Irsa Wiginton", "mDETECT", "Co-Founder and Chief Development Officer"],
  ["Srijit Khan", "Sanofi", "Process Validation Scientist"],
  ["Yosuke Niibori", "Re:Pair Genomics", "CSO"],
  ["Christina Armstrong", "Catalent", "Director of Product Development for Canada"],
];
export const PEOPLE_2026: PlanPerson[] = [
  ...symposium.map((row) => ({ row, event: "2026-annual-symposium", source: "https://biohubnet.ca/2026-annual-symposium/" })),
  ...insights.map((row) => ({ row, event: "2026-industry-insights", source: "https://biohubnet.ca/industry-insights/" })),
].map(({ row: [fullName, organization, title], event, source }) => ({
  id: `web-${event}-${fullName.toLowerCase().replace(/[^a-z]+/g, "-")}`,
  fullName, organization, title, bio: "", email: "", source: "website", sourceUrl: source,
  eventTags: [event], session: null, linkedSpeakerId: null, ignoredSpeakerIds: [], archived: false,
}));
