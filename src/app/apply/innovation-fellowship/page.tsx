import type { Metadata } from "next";
import { BriefcaseBusiness, CalendarRange, GraduationCap } from "lucide-react";
import { PublicEquipStart } from "@/components/equip/PublicEquipStart";

export const metadata: Metadata = {
  title: "Apply - EQUIP Innovation Fellowship",
  description:
    "Apply for an EQUIP trainee entrepreneur fellowship or innovation internship through BioHubNet.",
};

export const dynamic = "force-dynamic";

const opportunities = [
  {
    icon: GraduationCap,
    title: "Master's / PhD Fellowship",
    detail: "$20,333 CAD for six months",
  },
  {
    icon: CalendarRange,
    title: "Postdoctoral Fellowship",
    detail: "$30,000 CAD for six months",
  },
  {
    icon: BriefcaseBusiness,
    title: "Innovation Internship",
    detail: "Stipend support for an entrepreneurship-focused placement",
  },
];

export default function InnovationFellowshipApplyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-subtle">
        BioHubNet EQUIP
      </p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-fg">
        Innovation Fellowship application
      </h1>
      <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">
        Apply for six months of trainee entrepreneur support or an innovation internship
        with an accelerator or innovation organization. You will choose the opportunity
        inside the application.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {opportunities.map(({ icon: Icon, title, detail }) => (
          <div key={title} className="rounded-lg border border-line bg-card p-4">
            <Icon size={18} className="text-brand-700" />
            <h2 className="mt-3 text-sm font-bold text-fg">{title}</h2>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{detail}</p>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <PublicEquipStart
          stream="innovation_fellowship"
          destination="/apply/innovation-fellowship"
        />
      </div>

      <p className="mt-6 text-[12px] leading-relaxed text-muted">
        Questions? Write to{" "}
        <a href="mailto:equip@biohubnet.ca" className="font-semibold text-brand-700 hover:underline">
          equip@biohubnet.ca
        </a>
        .
      </p>
    </main>
  );
}
