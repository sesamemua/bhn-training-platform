// Current approved networking roster checked on October 19, 2026. No public posting is triggered here.
export const NETWORKING_GROUPS = [
  {
    number: 1,
    hook: "What does a career in biopharma look like beyond the job description?",
    invitation: "Bring your questions about bioprocessing, regulatory affairs and advanced therapies to Structured Networking with Industry Professionals at BioHubNet's 2026 Annual Symposium.",
    people: [
      { name: "Cynthia Elias", title: "Senior Principal Scientist", company: "Sanofi", graphicCompany: "Sanofi" },
      { name: "David Sealey", title: "Director, Regulatory Affairs (Oncology)", company: "AstraZeneca Canada", graphicCompany: "AstraZeneca Canada" },
      { name: "Lynne Liu", title: "Global Regulatory Affairs CMC Lead", company: "Sanofi", graphicCompany: "Sanofi" },
      { name: "Liz Csaszar", title: "Director, Cell Processing Laboratory", company: "UHN", graphicCompany: "UHN" },
    ],
    closing: "Meet professionals whose work connects scientific knowledge with the development and delivery of medicines. Start a conversation about the skills and experiences that matter in their fields.",
  },
  {
    number: 2,
    hook: "How are regulatory expertise and AI changing the way life sciences teams work?",
    invitation: "Make space for that conversation at Structured Networking with Industry Professionals, part of BioHubNet's 2026 Annual Symposium.",
    people: [
      { name: "Mona Abu Nameh", title: "CMC Regulatory Affairs Manager | Generative AI & Agents Change Management Lead", company: "AstraZeneca Canada", graphicCompany: "AstraZeneca Canada" },
      { name: "Shadan Ashfaie", title: "Enterprise AI Transformation & Applied AI Portfolio Leader | Advisor", company: "Amgen (Consultant)", graphicCompany: "Amgen (Consultant)" },
      { name: "Kathy Lee", title: "Regulatory Affairs Clinical Trials Associate", company: "AstraZeneca Canada", graphicCompany: "AstraZeneca Canada" },
    ],
    closing: "Bring your questions about career transitions, regulatory work and the practical adoption of emerging technologies. Connect with people working across these areas.",
  },
  {
    number: 3,
    hook: "Your research has potential. What could help you take the next step?",
    invitation: "Connect with founders and innovation professionals at Structured Networking with Industry Professionals during BioHubNet's 2026 Annual Symposium.",
    people: [
      { name: "Yosuke Niibori", title: "Chief Scientific Officer", company: "Re:Pair Genomics", graphicCompany: "Re:Pair Genomics" },
      { name: "Angela Davoud", title: "Co-founder & Chief Growth Officer", company: "PeakR&D", graphicCompany: "PeakR&D" },
      { name: "Donghoon Lee", title: "CEO", company: "Omphalos Lifesciences", graphicCompany: "Omphalos Lifesciences" },
    ],
    closing: "Explore the move from academic research into biotechnology entrepreneurship, the role of funding strategy and the value of working across disciplines. Bring a question, an idea or a career goal to the conversation.",
  },
  {
    number: 4,
    hook: "A science background can open doors you may not have considered.",
    invitation: "Discover different paths through Structured Networking with Industry Professionals at BioHubNet's 2026 Annual Symposium.",
    people: [
      { name: "Jasmine Hamilton", title: "Senior Advisor", company: "Health Emergency Readiness Canada, Innovation, Science and Economic Development Canada", graphicCompany: "Health Emergency Readiness Canada" },
      { name: "Alex Kamp", title: "Curriculum Development & Partnerships Lead", company: "CATTI", graphicCompany: "CATTI" },
      { name: "Gena Markous", title: "Life Sciences Insurance Advisor", company: "HUB International", graphicCompany: "HUB International" },
    ],
    closing: "From public-sector collaboration and biomanufacturing training to life sciences risk management, meet people applying scientific experience in different ways. Bring your questions about the paths, skills and connections that helped them get there.",
  },
] as const;

export const SYMPOSIUM_NETWORKING_POSTS = NETWORKING_GROUPS.map((group) => ({
  slug: `symposium-2026-networking-${group.number}`,
  title: `2026 Symposium | Structured Networking with Industry Professionals (${group.number}/4)`,
  workshopSlug: null,
  suggestedDate: `2026-10-${19 + group.number}T13:00:00Z`,
  sourceUrl: "https://biohubnet.ca/2026-annual-symposium/",
  assetUrl: `https://bhn-training-platform.vercel.app/social/symposium-2026/networking-${group.number}.png`,
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
