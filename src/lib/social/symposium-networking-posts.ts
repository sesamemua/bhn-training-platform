// Published networking roster checked on October 21, 2026. No public posting is triggered here.
export const NETWORKING_GROUPS = [
  {
    number: 1,
    hook: "From research to real-world medicines: what does that career path involve?",
    invitation: "Meet professionals working across biopharma, regulatory affairs and cell therapy at Structured Networking with Industry Professionals, part of BioHubNet's 2026 Annual Symposium.",
    people: [
      { name: "Cynthia Elias", title: "Senior Principal Scientist", company: "Sanofi", graphicCompany: "Sanofi" },
      { name: "David Sealey", title: "Director, Regulatory Affairs (Oncology)", company: "AstraZeneca Canada", graphicCompany: "AstraZeneca Canada" },
      { name: "Lynne Liu", title: "Global Regulatory Affairs CMC Lead", company: "Sanofi", graphicCompany: "Sanofi" },
      { name: "Liz Csaszar", title: "Director, Cell Processing Laboratory", company: "UHN", graphicCompany: "UHN" },
    ],
    closing: "Ask about the skills, decisions and experiences behind their work. Bring a question about moving from academic research into the development, regulation or manufacturing of medicines.",
  },
  {
    number: 2,
    hook: "AI adoption and regulatory careers: what does the work look like in practice?",
    invitation: "Go beyond the headlines in conversations with industry professionals at Structured Networking with Industry Professionals, part of BioHubNet's 2026 Annual Symposium.",
    people: [
      { name: "Mona Abu Nameh", title: "CMC Regulatory Affairs Manager | Generative AI & Agents Change Management Lead", company: "AstraZeneca Canada", graphicCompany: "AstraZeneca Canada" },
      { name: "Shadan Ashfaie", title: "Enterprise AI Transformation & Applied AI Portfolio Leader | Advisor", company: "Amgen (Consultant)", graphicCompany: "Amgen (Consultant)" },
      { name: "Kathy Lee", title: "Regulatory Affairs Clinical Trials Associate", company: "AstraZeneca Canada", graphicCompany: "AstraZeneca Canada" },
    ],
    closing: "Bring your questions about regulatory career paths, changing team workflows and the practical adoption of AI. Hear how these professionals have built their expertise and navigated change.",
  },
  {
    number: 3,
    hook: "Research, entrepreneurship and your next industry connection: where do you start?",
    invitation: "Meet founders and talent-development professionals at Structured Networking with Industry Professionals during BioHubNet's 2026 Annual Symposium.",
    people: [
      { name: "Yosuke Niibori", title: "Chief Scientific Officer", company: "Re:Pair Genomics", graphicCompany: "Re:Pair Genomics" },
      { name: "Angela Davoud", title: "Co-founder & Chief Growth Officer", company: "PeakR&D", graphicCompany: "PeakR&D" },
      { name: "Donghoon Lee", title: "CEO", company: "Omphalos Lifesciences", graphicCompany: "Omphalos Lifesciences" },
      { name: "Anu Vajjala", title: "Employer Liaison", company: "ACCES Employment", graphicCompany: "ACCES Employment" },
    ],
    closing: "Explore biotechnology entrepreneurship, funding strategy and the connections that support industry careers. Bring your questions, not a polished pitch.",
  },
  {
    number: 4,
    hook: "Your next step in STEM may be a path you have not considered yet.",
    invitation: "Explore career choices, leadership and different ways to put a science background to work at Structured Networking with Industry Professionals during BioHubNet's 2026 Annual Symposium.",
    people: [
      { name: "Jasmine Hamilton", title: "Senior Advisor", company: "Health Emergency Readiness Canada, Innovation, Science and Economic Development Canada", graphicCompany: "Health Emergency Readiness Canada" },
      { name: "Alex Kamp", title: "Curriculum Development & Partnerships Lead", company: "CATTI", graphicCompany: "CATTI" },
      { name: "Gena Markous", title: "Life Sciences Insurance Advisor", company: "HUB International", graphicCompany: "HUB International" },
      { name: "Melissa E Anders", title: "Founder, Leadership & Career Coach", company: "Melissa E Anders Coaching", graphicCompany: "Melissa E Anders Coaching" },
    ],
    closing: "From public service and biomanufacturing training to life sciences insurance and STEM career coaching, explore where your experience could lead. Ask about career pivots, leadership and building a career that fits your goals.",
  },
] as const;

export const SYMPOSIUM_NETWORKING_POSTS = NETWORKING_GROUPS.map((group) => ({
  slug: `symposium-2026-networking-${group.number}`,
  title: `2026 Symposium | Structured Networking with Industry Professionals (${group.number}/4)`,
  workshopSlug: null,
  suggestedDate: `2026-10-${19 + group.number}T13:00:00Z`,
  sourceUrl: "https://biohubnet.ca/2026-annual-symposium/",
  assetUrl: `https://bhn-training-platform.vercel.app/social/symposium-2026/networking-${group.number}.png?v=${group.number === 3 ? "20261021-roster15" : "20261020-roster14"}`,
  graphicBrief: `BioHubNet logo, 2026 Annual Symposium, full Structured Networking with Industry Professionals heading. Original circular headshots with no retouching or color changes: ${group.people.map((p) => p.name).join(", ")}. Names and organizations only on the graphic; professional titles in the caption. Spacious layout, subtle glass edge, October 29 | Toronto | Register now. Recheck the current networking lineup before approving.`,
  body: `${group.hook}

${group.invitation}

Meet:
${group.people.map((person) => `@${person.name}, ${person.title}, ${person.company}`).join("\n")}

${group.closing}

October 29, 2026 | Chelsea Hotel, Toronto
Structured networking: 3:30-4:45 p.m. ET
Registration closes October 23.

Explore the program and register:
https://biohubnet.ca/2026-annual-symposium/

#BioHubNet #LifeSciences #CareerDevelopment #Networking`,
}));
