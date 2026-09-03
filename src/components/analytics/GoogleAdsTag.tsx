"use client";

import Script from "next/script";
import { useConsent } from "@/components/consent/ConsentProvider";
import { googleAdsId } from "@/lib/campaign/google-ads-conversions";

/** Load the Google tag only after explicit marketing consent. */
export function GoogleAdsTag() {
  const { consent, ready } = useConsent();
  const id = googleAdsId();

  if (!ready || !consent.marketing || !id) return null;

  return (
    <>
      <Script
        id="google-ads-tag-loader"
        src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
        strategy="afterInteractive"
      />
      <Script id="google-ads-tag-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          window.gtag = window.gtag || function(){window.dataLayer.push(arguments);};
          window.gtag('js', new Date());
          window.gtag('config', '${id}', { allow_google_signals: true });
        `}
      </Script>
    </>
  );
}
