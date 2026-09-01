export const CAMPAIGN_EVENT_NAMES = {
  ctaClick: "campaign_cta_click",
  eligibilityComplete: "campaign_eligibility_complete",
  engageApplicationSubmitted: "engage_training_credit_application_submitted",
  experienceApplicationSubmitted: "experience_talent_pool_application_submitted",
  ventureConnectApplicationSubmitted: "equip_ventureconnect_application_submitted",
} as const;

export type CampaignProgram = "engage" | "experience" | "venture_connect";
