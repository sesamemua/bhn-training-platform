import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProgramCampaignPage } from "@/components/campaign/ProgramCampaignPage";
import { campaignAttributionFromRecord } from "@/lib/campaign/attribution";
import {
  activePublishedDeadline,
  CAMPAIGN_PROGRAMS,
  getCampaignProgram,
} from "@/lib/campaign/programs";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ program: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export function generateStaticParams() {
  return Object.keys(CAMPAIGN_PROGRAMS).map((program) => ({ program }));
}

export async function generateMetadata({ params }: Pick<PageProps, "params">): Promise<Metadata> {
  const { program } = await params;
  const config = getCampaignProgram(program);
  if (!config) return {};
  return {
    title: `${config.title} | BioHubNet Training`,
    description: config.summary,
    alternates: { canonical: `/for-trainees/${config.slug}` },
    openGraph: {
      title: config.title,
      description: config.summary,
      type: "website",
    },
  };
}

export default async function CampaignProgramPage({ params, searchParams }: PageProps) {
  const [{ program }, query] = await Promise.all([params, searchParams]);
  const config = getCampaignProgram(program);
  if (!config) notFound();

  const attribution = campaignAttributionFromRecord(query);
  const deadline = activePublishedDeadline(config);

  return (
    <ProgramCampaignPage
      config={config}
      attribution={attribution}
      activeDeadlineLabel={deadline?.label ?? null}
    />
  );
}
