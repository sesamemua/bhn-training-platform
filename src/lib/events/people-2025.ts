import type { PlanPerson } from "./people-plan";

export const PEOPLE_2025_SOURCE = "https://biohubnet.ca/2025-annual-symposium/";
// Historical affiliations, checked against the official 2025 page on 2026-10-07.
// Biographies are brief factual summaries, not current-role assertions.
const profiles = [
  ["kelley-parato", "Kelley Parato", "National Research Council Canada", "R&D Director, Bioprocess Engineering", "Research leadership spanning gene therapy, translational science and biomanufacturing.", "09/bio-kelley-parato-265x352-1-150x150.jpg"],
  ["rob-henderson", "Rob Henderson", "BioTalent Canada", "President and CEO", "Bioscience workforce leader with executive experience in talent development and inclusion.", "09/Rob-Henderson-150x150.png"],
  ["ana-mcgovern", "Ana McGovern", "McGovern Management Group Inc.", "Executive Recruiter", "Life-sciences recruiter and career coach working across pharmaceuticals, biotechnology and medical devices.", "09/Ana-McGovern-1-150x150.jpg"],
  ["cynthia-elias", "Cynthia Elias", "Sanofi", "Senior Principal Scientist", "Bioprocess scientist with vaccine, cell culture and gene therapy manufacturing experience.", "09/Cynthia-Elias-profile-picture-150x150.jpg"],
  ["logan-germain", "Logan Germain", "Queen's University", "PhD Candidate; BioHubNet Trainee", "Doctoral research examines environmental pollutants and early molecular indicators of disease.", "09/LOGAN-GERMAIN-150x150.jpg"],
  ["neil-blackburn", "Neil Blackburn", "OmniaBio Inc.", "Senior Director, Process and Analytical Development", "Background in protein biochemistry, immunology, vaccines and cell and gene therapy development.", "09/Neil-Blackburn-150x150.jpg"],
  ["david-sealey", "David Sealey", "AstraZeneca Canada", "Director, Regulatory Affairs (Oncology)", "Regulatory leader with drug-development experience and a history of mentoring science trainees.", "09/David-Sealey-147x150.png"],
  ["lisa-wise-milestone", "Lisa Wise-Milestone", "Moderna Canada", "Associate Director, Strategic Partnerships", "Works on pandemic preparedness partnerships; background in bioengineering and commercialization.", "09/Lisa-Wise-Milestone-150x150.jpg"],
  ["helen-sarantis", "Helen Sarantis", "BlueRock Therapeutics", "Associate Director, Analytical & Quality Control", "Experience across biotechnology quality control, quality assurance and research and development.", "09/Helen-Sarantis-150x150.jpeg"],
  ["jonathan-labriola", "Jonathan Labriola", "Synakis", "Director of Operations; BioHubNet Trainee", "Biochemistry and immunology background, with research in protein therapeutics and ocular formulations.", "09/Jon-150x140.jpg"],
  ["nana-lee", "Nana Hyung-Ran Lee", "University of Toronto", "Associate Professor, Teaching Stream; Director, Graduate Professional Development", "Biochemistry educator and career-development leader with biotechnology industry experience.", "10/Nana-150x150.jpg"],
  ["ketheisan-vigneshwaran", "Ketheisan Vigneshwaran", "University of Toronto", "Career Educator, Career Exploration & Education", "Career educator with mathematics and education training, focused on inclusive learner development.", "10/Ketheisan-150x150.jpg"],
];

export const PEOPLE_2025: PlanPerson[] = profiles.map(([id, fullName, organization, title, bio, photo]) => ({
  id: `2025-${id}`, fullName, organization, title, bio, email: "", session: null, source: "2025",
  sourceUrl: PEOPLE_2025_SOURCE, photoUrl: `https://biohubnet.ca/wp-content/uploads/2025/${photo}`,
  linkedSpeakerId: null, ignoredSpeakerIds: [], archived: false,
}));
