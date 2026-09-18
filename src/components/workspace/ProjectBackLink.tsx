import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { VIDEO_BASE } from "@/lib/video/paths";

/** "All projects" button for the PageHero on every project tab. */
export function ProjectBackLink() {
  return (
    <Link
      href={VIDEO_BASE}
      className="inline-flex items-center gap-1.5 rounded-md border border-line bg-card-solid px-3 py-1.5 text-xs font-semibold text-fg hover:bg-elevated"
    >
      <ArrowLeft size={13} /> All projects
    </Link>
  );
}
