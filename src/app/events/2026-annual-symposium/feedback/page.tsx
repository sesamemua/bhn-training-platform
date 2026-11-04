import type { Metadata } from "next";
import { LinkedinFeedback } from "@/components/events/LinkedinFeedback";
import { loadLinkedinBoard } from "@/lib/events/linkedin-store";
import { publicLinkedinTestimonials } from "@/lib/events/linkedin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Community reflections | BioHubNet 2026", description: "Community reflections on BioHubNet’s 2026 Annual Symposium and Training Week." };

export default async function FeedbackPage() {
  const { board } = await loadLinkedinBoard();
  return <LinkedinFeedback quotes={publicLinkedinTestimonials(board)} />;
}
