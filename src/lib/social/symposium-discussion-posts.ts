// Discussion groups requested by Ruilin on October 26, 2026.
export const DISCUSSION_GROUPS = [
  {
    number: 1,
    hook: "What will AI change about the way life sciences teams work?",
    theme: "AI and the Future of Work in Life Sciences",
    people: [
      { name: "Jessica Tate", title: "Vice-President, Vector Platform Technology", company: "CCRM/DTBL", graphicCompany: "CCRM / DTBL" },
      { name: "Juliana Jy", title: "Senior Program Manager", company: "CCRM/DTBL", graphicCompany: "CCRM / DTBL" },
      { name: "Angela Shaoxu Li", title: "Digital Product Manager", company: "Sanofi", graphicCompany: "Sanofi" },
    ],
    closing: "Bring your questions about emerging skills, changing workflows and how people can adapt. Take part in a focused conversation rather than just listening from the audience.",
  },
  {
    number: 2,
    hook: "The next connection for your research could start with a conversation.",
    theme: null,
    people: [
      { name: "Pierre-Jean Alarco", title: "Knowledge Mobilization Officer", company: "RampUp", graphicCompany: "RampUp" },
      { name: "Sven Ansorge", title: "Director, Technical Training and Innovation", company: "CASTL", graphicCompany: "CASTL" },
      { name: "Gregory De Crescenzo", title: "Professor", company: "Polytechnique Montreal", graphicCompany: "Polytechnique Montréal" },
      { name: "Garima Ghale", title: "Associate Director, Programs & Strategic Partnerships", company: "OBIO", graphicCompany: "OBIO" },
    ],
    closing: "Meet people working across knowledge mobilization, research and biomanufacturing training. Bring a question, share your perspective and explore connections across the life sciences community.",
  },
] as const;

export const SYMPOSIUM_DISCUSSION_POSTS = DISCUSSION_GROUPS.map((group) => ({
  slug: `symposium-2026-discussion-${group.number}`,
  title: `2026 Symposium | Interactive Discussion Session (${group.number}/2)`,
  workshopSlug: null,
  suggestedDate: "2026-10-23T13:00:00Z",
  sourceUrl: "https://biohubnet.ca/2026-annual-symposium/",
  assetUrl: `https://bhn-training-platform.vercel.app/social/symposium-2026/discussion-${group.number}.png?v=20261026-discussion-groups`,
  graphicBrief: `BioHubNet logo, large 2026 Annual Symposium and Interactive Discussion Session headings. Unretouched original rounded headshots: ${group.people.map((p) => p.name).join(", ")}. Names and organizations only; titles stay in the caption. Spacious white layout with a restrained glass edge. October 29 | Toronto. Registration is closed; no registration CTA. ${group.theme ? `Approved topic: ${group.theme}.` : "Do not invent a table topic."} Use the discussion groups requested on October 26, 2026.`,
  body: `${group.hook}

Join the Interactive Discussion Session at BioHubNet's 2026 Annual Symposium.
${group.theme ? `\nDiscussion topic: ${group.theme}\n` : ""}
Meet:
${group.people.map((p) => `@${p.name}, ${p.title}, ${p.company}`).join("\n")}

${group.closing}

October 29, 2026 | Chelsea Hotel, Toronto
Interactive discussion: 3:30-4:45 p.m. ET
This session runs concurrently with Structured Networking with Industry Professionals; plan to attend one, not both.

Symposium program:
https://biohubnet.ca/2026-annual-symposium/

#BioHubNet #LifeSciences #Biomanufacturing #Networking`,
}));
