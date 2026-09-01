"use client";

import { useEffect } from "react";
import { storeCampaignAttribution } from "@/lib/campaign/attribution-client";
import type { CampaignAttribution } from "@/lib/campaign/attribution";

export function CampaignAttributionCapture({
  attribution,
}: {
  attribution: CampaignAttribution;
}) {
  useEffect(() => {
    storeCampaignAttribution(attribution);
  }, [attribution]);

  return null;
}
