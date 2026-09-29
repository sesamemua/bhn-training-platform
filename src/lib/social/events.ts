import { withSocialTags } from "./tags";

export const CRS_EVENT_POST = {
  stream: "events",
  kind: "event",
  deadlineId: "crs-womens-health-symposium-2026",
  key: "events:event:crs-womens-health-symposium-2026:0",
  body: withSocialTags(`BioHubNet is pleased to support the CRS Women’s Health Symposium 2026 as a sponsor!

Bringing together researchers, clinicians, industry experts and trainees, the symposium creates space to share ideas, build connections and advance innovation in women’s health.

Its focus on collaboration, emerging talent and translating research into real-world impact aligns closely with BioHubNet’s commitment to developing talent and strengthening Canada’s life sciences community. We’re happy to be there supporting these conversations and connections.

Learn more about the symposium:
https://obgyn.utoronto.ca/event/crs-womens-health-symposium-2026

#BioHubNet #WomensHealth #LifeSciences #ResearchInnovation #TalentDevelopment`),
  assetSpec: { title: "CRS Women’s Health Symposium 2026" },
  scheduledFor: new Date("2026-09-29T13:00:00Z"),
};
