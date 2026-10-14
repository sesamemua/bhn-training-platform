import { OCTOBER_PROMOTIONS } from "./october-promotions";

interface CampaignPost {
  slug: string;
  title: string;
  workshopSlug: string | null;
  suggestedDate: string;
  sourceUrl: string;
  graphicBrief: string;
  photoBrief?: string;
  body: string;
}

export const SYMPOSIUM_CAMPAIGN_PLAN: readonly CampaignPost[] = [
  ...OCTOBER_PROMOTIONS,
  {
    slug: "symposium-2026-ai-panel-oct21",
    title: "2026 Symposium | AI and the future workforce",
    workshopSlug: null,
    suggestedDate: "2026-10-21T13:00:00Z",
    sourceUrl: "https://biohubnet.ca/2026-annual-symposium/",
    graphicBrief: "BioHubNet logo, large 2026 Annual Symposium heading, AI in the Workplace, Oct 29 | Toronto, Register now. Soft blurred twisting-glass background; one theme, large type, no individual speaker portraits or bios.",
    body: `AI is changing how we work. What skills will help life sciences talent keep pace?

Explore that question at BioHubNet's 2026 Annual Symposium. The AI in the Workplace panel will examine emerging skills and workforce transformation, alongside conversations about career opportunities and Canada's biomanufacturing capacity.

Bring your questions and connect with people across research, industry and the innovation community.

October 29, 2026 | Chelsea Hotel, Toronto

Explore the program and register:
https://biohubnet.ca/2026-annual-symposium/

#BioHubNet #LifeSciences #FutureOfWork #Biomanufacturing`,
  },
  {
    slug: "symposium-2026-careers-connections-oct22",
    title: "2026 Symposium | Panel 2: Expanding Career Horizons",
    workshopSlug: null,
    suggestedDate: "2026-10-22T13:00:00Z",
    sourceUrl: "https://biohubnet.ca/2026-annual-symposium/",
    graphicBrief: "BioHubNet logo, large 2026 Annual Symposium heading, Panel 2: Expanding Career Horizons, Oct 29 | Toronto, Register now. Three smaller submitted headshots: Angela Davoud (PeakR&D), Jasmine Hamilton (Health Emergency Readiness Canada), Sven Ansorge (CASTL). Soft blurred twisting-glass edge, generous whitespace, readable names, no full bios. All three headshots and bios verified October 13, 2026; recheck the panel lineup before publication.",
    body: `Where could your life sciences career take you next?

Join BioHubNet's 2026 Annual Symposium for Panel 2: Expanding Career Horizons - Discovering Hidden Career Opportunities.

Hear perspectives from:
@Angela Davoud, Co-founder & CGO, PeakR&D
@Jasmine Hamilton, Senior Advisor, Health Emergency Readiness Canada
@Sven Ansorge, Director, Technical Training and Innovation, CASTL

Explore possibilities beyond familiar career paths, bring your questions and connect with people across research, industry and innovation. Stay for the afternoon networking and discussion sessions.

October 29, 2026 | Chelsea Hotel, Toronto
Panel 2: 1:30-2:15 p.m. ET

Discover the program and register:
https://biohubnet.ca/2026-annual-symposium/

#BioHubNet #LifeSciences #CareerDevelopment #Networking`,
  },
  {
    slug: "symposium-2026-week-ahead-oct23",
    title: "Training Week + Symposium | Next week",
    workshopSlug: null,
    suggestedDate: "2026-10-23T13:00:00Z",
    sourceUrl: "https://biohubnet.ca/2026-annual-symposium/",
    graphicBrief: "BioHubNet logo, Training Week | Oct 26-28, Annual Symposium | Oct 29, Toronto. Two large date blocks over a soft blurred twisting-glass background. CTA: Explore the week. No full timetable or small print.",
    body: `Next week: build skills, explore ideas and make new connections with BioHubNet.

October 26-28: Training Week brings workshops, industry tours and Innovation Ignited, our trainee pitch and venture showcase.

October 29: the Annual Symposium brings the community together at the Chelsea Hotel in Toronto for Christopher Procyshyn's keynote, panel discussions and networking.

Training Week participants: check your approved-session email for your assigned activities and arrival details. Sessions overlap, so attend only the sessions you have been approved for.

Explore Training Week:
https://biohubnet.ca/training-week-2026/

See the symposium program and registration:
https://biohubnet.ca/2026-annual-symposium/

#BioHubNet #TrainingWeek #LifeSciences #Biomanufacturing`,
  },
  {
    slug: "training-week-2026-day-one-photo-oct26",
    title: "Training Week | Day 1 in pictures",
    workshopSlug: null,
    suggestedDate: "2026-10-26T20:30:00Z",
    sourceUrl: "https://biohubnet.ca/2026-annual-symposium/",
    graphicBrief: "Real workshop or tour photo, with a small unobtrusive BioHubNet logo and optional large Training Week | Day 1 label. Let the photo lead; no twisting-glass layer over the people.",
    photoBrief: "Capture a wide learning scene and a candid interaction at Pandemic Preparedness or the Microbix tour. Get host clearance before taking or publishing facility photos, especially in high-containment areas. Photograph only participants with permission; avoid badges, screens and confidential materials. Use a group photo in an approved public area if facility photography is restricted.",
    body: `Training Week is underway!

A look at today's BioHubNet activities: practical learning, questions and conversations connecting life sciences research with real-world work.

Thank you to our hosts and participants for making space to learn from one another.

The conversations continue at the BioHubNet 2026 Annual Symposium on Thursday, October 29 at the Chelsea Hotel in Toronto.

Explore the symposium and registration:
https://biohubnet.ca/2026-annual-symposium/

#BioHubNet #TrainingWeek #LifeSciences #Biomanufacturing`,
  },
  {
    slug: "training-week-2026-day-two-photo-oct27",
    title: "Training Week | Skills in action",
    workshopSlug: null,
    suggestedDate: "2026-10-27T21:30:00Z",
    sourceUrl: "https://biohubnet.ca/2026-annual-symposium/",
    graphicBrief: "Real participant-focused workshop photo or two-photo carousel. BioHubNet logo, optional large Skills in action heading. No trainer biography or portrait-led spotlight.",
    photoBrief: "Capture a pair or small group practising an exercise at Communication Chameleon or Negotiation Navigator, plus an approved Discovery to Delivery group photo if available. Choose one actual activity for the caption, or identify each photo clearly if combining sessions. Obtain participant permission and CCRM host clearance; avoid identifiable badges, whiteboards, screens and confidential lab details.",
    body: `Strong science. Practical skills. New connections.

Today's BioHubNet Training Week activities put learning into practice, from career skills to conversations about moving research toward real-world impact.

Thank you to our workshop and industry hosts, and to everyone taking part.

Join the wider community this Thursday, October 29, at the BioHubNet 2026 Annual Symposium in Toronto.

Explore the program and registration:
https://biohubnet.ca/2026-annual-symposium/

#BioHubNet #TrainingWeek #CareerDevelopment #LifeSciences`,
  },
  {
    slug: "training-week-2026-innovation-photo-oct28",
    title: "Training Week | Innovation Ignited in pictures",
    workshopSlug: null,
    suggestedDate: "2026-10-28T18:30:00Z",
    sourceUrl: "https://biohubnet.ca/2026-annual-symposium/",
    graphicBrief: "Real Innovation Ignited photo: a trainee pitch, a poster conversation or the Founders Panel. BioHubNet logo, optional large Innovation Ignited heading. Do not publish confidential venture details.",
    photoBrief: "Capture a pitch from the audience, a poster conversation and a wide showcase scene. Get founder and participant permission before sharing identifiable people, pitch slides or poster content. Exclude confidential venture details. Choose 2-3 approved photos; verify names and any factual highlights before adding them to the caption.",
    body: `Ideas need more than a lab. They need conversations, feedback and connections.

A look at Innovation Ignited, part of BioHubNet Training Week: trainee ventures, founder perspectives and conversations about bringing human-health innovations toward real-world impact.

Thank you to the founders, trainees and innovation community taking part.

Tomorrow, the conversation continues at BioHubNet's 2026 Annual Symposium at the Chelsea Hotel in Toronto.

View tomorrow's program and registration:
https://biohubnet.ca/2026-annual-symposium/

#BioHubNet #TrainingWeek #BiotechInnovation #Entrepreneurship`,
  },
  {
    slug: "symposium-2026-on-the-day-photo-oct29",
    title: "2026 Symposium | Today in pictures",
    workshopSlug: null,
    suggestedDate: "2026-10-29T21:00:00Z",
    sourceUrl: "https://biohubnet.ca/2026-annual-symposium/",
    graphicBrief: "Real symposium photo carousel: room-wide view, keynote or panel, and networking. BioHubNet logo, large 2026 Annual Symposium title only on the cover if needed. No full bios or dense captions on images.",
    photoBrief: "Capture an opening room-wide view, Christopher's keynote, a panel and a networking interaction. Select 2-3 consent-cleared photos. Do not show attendee lists or identifiable badge details. Confirm the pictured activities took place before approving the caption.",
    body: `A day for the people shaping the future of life sciences.

Today, the BioHubNet community came together at the Chelsea Hotel in Toronto for our 2026 Annual Symposium: perspectives on the future workforce, career pathways, biomanufacturing and the connections that help ideas move forward.

Thank you to our participants, speakers, hosts and partners for being part of the conversation.

Explore the program:
https://biohubnet.ca/2026-annual-symposium/

#BioHubNet #LifeSciences #Biomanufacturing #TalentDevelopment`,
  },
];
