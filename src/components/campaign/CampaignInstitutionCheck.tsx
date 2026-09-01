"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, CircleAlert, LogIn } from "lucide-react";
import { INSTITUTIONS, type InstitutionRegion } from "@/lib/equip/institutions";
import {
  appendCampaignAttribution,
  campaignAuthUrl,
  type CampaignAttribution,
} from "@/lib/campaign/attribution";
import { checkCampaignInstitution } from "@/lib/campaign/eligibility";
import { CAMPAIGN_EVENT_NAMES, type CampaignProgram } from "@/lib/campaign/events";
import { track } from "@/lib/track";

const REGION_ORDER: InstitutionRegion[] = [
  "British Columbia",
  "Prairies",
  "Ontario",
  "Quebec",
  "Atlantic Canada",
];

interface Props {
  program: CampaignProgram;
  programName: string;
  description: string;
  applicationPath: string;
  authRequired: boolean;
  primaryAction: string;
  contactEmail: string;
  attribution: CampaignAttribution;
}

export function CampaignInstitutionCheck({
  program,
  programName,
  description,
  applicationPath,
  authRequired,
  primaryAction,
  contactEmail,
  attribution,
}: Props) {
  const [institutionSlug, setInstitutionSlug] = useState("");
  const lastTracked = useRef("");
  const result = useMemo(
    () => (institutionSlug ? checkCampaignInstitution(program, institutionSlug) : null),
    [institutionSlug, program],
  );

  const applicationHref = appendCampaignAttribution(applicationPath, attribution);
  const registerHref = campaignAuthUrl("register", applicationPath, attribution);
  const loginHref = campaignAuthUrl("login", applicationPath, attribution);

  function selectInstitution(slug: string) {
    setInstitutionSlug(slug);
    if (!slug || lastTracked.current === slug) return;
    lastTracked.current = slug;
    const checked = checkCampaignInstitution(program, slug);
    track(CAMPAIGN_EVENT_NAMES.eligibilityComplete, {
      program,
      eligible: checked.eligible,
      reason: checked.reason,
      institutionSlug: slug,
      access: checked.access,
      attribution,
    });
  }

  function trackApplicationClick(accountPath: "new_account" | "existing_account" | "public_form") {
    track(CAMPAIGN_EVENT_NAMES.ctaClick, {
      program,
      action: "application_start",
      accountPath,
      destination: applicationPath,
      attribution,
    });
  }

  return (
    <div className="rounded-lg border border-line bg-card-solid p-5 shadow-sm sm:p-7">
      <div className="max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">
          Institution eligibility check
        </p>
        <h3 className="mt-2 text-2xl font-bold text-fg">Find your institution</h3>
        <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
      </div>

      <label htmlFor={`campaign-institution-${program}`} className="mt-5 block max-w-2xl">
        <span className="mb-2 block text-sm font-semibold text-fg">Institution or research organization</span>
        <select
          id={`campaign-institution-${program}`}
          value={institutionSlug}
          onChange={(event) => selectInstitution(event.target.value)}
          className="w-full rounded-md border border-line-strong bg-card px-3 py-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
        >
          <option value="">Select your institution</option>
          {REGION_ORDER.map((region) => (
            <optgroup key={region} label={region}>
              {INSTITUTIONS.filter((institution) => institution.region === region)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((institution) => (
                  <option key={institution.slug} value={institution.slug}>
                    {institution.name}
                  </option>
                ))}
            </optgroup>
          ))}
          <option value="other">My institution is not listed</option>
        </select>
      </label>

      <div className="mt-5 min-h-24" aria-live="polite">
        {result?.eligible && result.institution ? (
          <div className="border-l-4 border-emerald-500 bg-emerald-50 px-4 py-3 text-emerald-950">
            <p className="flex items-center gap-2 font-bold">
              <CheckCircle2 size={18} aria-hidden /> Institution check passed
            </p>
            <p className="mt-1 text-sm leading-6">
              {result.institution.name} is in the current BioHubNet network for {programName}.
              {result.access === "limited"
                ? " Its published expansion access runs through January 2027."
                : " It is a full-access partner institution."}
              {" "}Your role, field and application materials are reviewed separately.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              {authRequired ? (
                <>
                  <Link
                    href={registerHref}
                    onClick={() => trackApplicationClick("new_account")}
                    className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                  >
                    Create an account and continue <ArrowRight size={16} aria-hidden />
                  </Link>
                  <Link
                    href={loginHref}
                    onClick={() => trackApplicationClick("existing_account")}
                    className="inline-flex min-h-11 items-center gap-2 rounded-md border border-brand-300 bg-white px-4 py-2.5 text-sm font-bold text-brand-800 transition hover:border-brand-500 hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                  >
                    <LogIn size={16} aria-hidden /> Sign in to continue
                  </Link>
                </>
              ) : (
                <Link
                  href={applicationHref}
                  onClick={() => trackApplicationClick("public_form")}
                  className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                >
                  {primaryAction} <ArrowRight size={16} aria-hidden />
                </Link>
              )}
            </div>
          </div>
        ) : null}

        {result && !result.eligible ? (
          <div className="border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-amber-950">
            <p className="flex items-center gap-2 font-bold">
              <CircleAlert size={18} aria-hidden /> Check with BioHubNet before applying
            </p>
            <p className="mt-1 text-sm leading-6">
              {result.reason === "published_window_ended"
                ? "The published national-expansion window has ended for this institution, so current access needs to be confirmed."
                : "This institution is not on the current 41-institution partner list."}
              {" "}Email{" "}
              <a className="font-bold underline" href={`mailto:${contactEmail}`}>
                {contactEmail}
              </a>{" "}
              before starting a funding or talent-pool application.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
