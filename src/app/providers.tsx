"use client";
import { Suspense } from "react";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import { DesignSystemProvider } from "@/components/ui/DesignSystemProvider";
import { PageViewTracker } from "@/components/analytics/PageViewTracker";
import { GoogleAdsTag } from "@/components/analytics/GoogleAdsTag";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { ConsentProvider } from "@/components/consent/ConsentProvider";
import { CookieBanner } from "@/components/consent/CookieBanner";
import { GreenwoodAtmosphere } from "@/components/themes/GreenwoodAtmosphere";
import { SakuraAtmosphere } from "@/components/themes/SakuraAtmosphere";
import { IceCreamAtmosphere } from "@/components/themes/IceCreamAtmosphere";
import { CanadaAtmosphere } from "@/components/themes/CanadaAtmosphere";
import { EndOfSummerAtmosphere } from "@/components/themes/EndOfSummerAtmosphere";
import { HarvestAtmosphere } from "@/components/themes/HarvestAtmosphere";
import { DemoTourProvider } from "@/lib/demo/tourContext";
import type { DesignSystemId } from "@/lib/design-system/registry";

export function Providers({
  children,
  initialDesignSystem,
}: {
  children: React.ReactNode;
  /** Platform-wide design system id, read server-side from the
   *  PlatformSetting table in the root layout. */
  initialDesignSystem: DesignSystemId;
}) {
  return (
    <SessionProvider>
      <I18nProvider>
        <ConsentProvider>
          <GoogleAdsTag />
          <ThemeProvider>
            <DesignSystemProvider value={initialDesignSystem}>
              <Suspense fallback={null}>
                <PageViewTracker />
              </Suspense>
              {/* Theme-specific decoration layer — renders falling
                  leaves, ground mist, dappled sunlight, fireflies +
                  a rotating scene caption when theme === "greenwood"
                  is active. Mounted inside ThemeProvider so it can
                  read the active theme; returns null for every other
                  theme so it's free until needed. */}
              <GreenwoodAtmosphere />
              {/* Falling cherry-blossom petals + pink mist when
                  theme === "sakura". Returns null for every other
                  theme — free while inactive. */}
              <SakuraAtmosphere />
              {/* Falling ice creams / popsicles / snowflakes /
                  ice cubes when theme === "icecream". Same
                  pre-randomised drift pattern as the other
                  atmospheres; returns null for every other
                  theme — free while inactive. */}
              <IceCreamAtmosphere />
              {/* Falling red maple leaves + red mist when
                  theme === "canada" (the O Canada July drop).
                  Returns null for every other theme — free while
                  inactive. */}
              <CanadaAtmosphere />
              <EndOfSummerAtmosphere />
              {/* Falling rust / burgundy / goldenrod leaves + woodsmoke
                  haze when theme === "harvest" (the fall drop that
                  replaced End of Summer once August ended). Returns
                  null for every other theme — free while inactive. */}
              <HarvestAtmosphere />
              {/* DemoTourProvider — global state + navigation side-effects
                  for the guided platform demo (admin/demo). Wraps children
                  so both the DemoHub launcher and the DemoOverlay visual
                  layer share a single context instance. Zero cost when
                  no tour is active (stage === "idle"). */}
              <DemoTourProvider>
                {children}
                <CookieBanner />
              </DemoTourProvider>
            </DesignSystemProvider>
          </ThemeProvider>
        </ConsentProvider>
      </I18nProvider>
    </SessionProvider>
  );
}
