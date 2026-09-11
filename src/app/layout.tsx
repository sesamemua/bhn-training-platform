import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { ThemeScript } from "@/components/ui/ThemeProvider";
import { I18nScript } from "@/lib/i18n/I18nProvider";
import { getActiveDesignSystem } from "@/lib/settings";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

/** Pin `metadataBase` to the production canonical URL so Next.js
 *  resolves the auto-discovered `opengraph-image.tsx` route to an
 *  absolute URL when social crawlers fetch the page. Without this,
 *  Slack / iMessage / LinkedIn / Twitter were either getting a
 *  relative path they couldn't resolve, or falling back to a
 *  generic preview. `NEXT_PUBLIC_SITE_URL` lets staging / preview
 *  deployments override the production URL without a code change. */
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://bhn-training-platform.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "BHN Training Platform",
  description:
    "BioHubNet's training, internship-matching, and venture-funding platform for the next generation of life-science talent.",
  openGraph: {
    title: "BioHubNet — Transformative Talent Development",
    description:
      "Training pathways, internship matching, and EQUIP micro-grants for biotech trainees, postdocs, and the partner labs that hire them.",
    siteName: "BioHubNet",
    type: "website",
    // Auto-discovered from src/app/opengraph-image.tsx. Listing it
    // explicitly here is belt-and-braces — many social crawlers
    // honour the `og:image` meta tag generated from this field but
    // are flakey about Next.js's auto-discovered file route alone.
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "BioHubNet — Transformative Talent Development",
      },
    ],
  },
  twitter: {
    // summary_large_image gives the full 1200×630 preview on
    // Twitter / X instead of the small thumbnail beside a single
    // line of text. Falls back to the openGraph image automatically.
    card: "summary_large_image",
    title: "BioHubNet — Transformative Talent Development",
    description:
      "Training pathways, internship matching, and EQUIP micro-grants for biotech trainees, postdocs, and the partner labs that hire them.",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Design system is platform-wide — admins set it from
  // /admin/design-system, every user of the platform sees the same
  // shell. Read once here and stamp it onto <html> so:
  //   • CSS selectors like `[data-design-system="cinematic"]` work
  //     during server render (no flash)
  //   • The client provider receives the value as a prop, no
  //     localStorage roundtrip or hydration mismatch
  const activeDesignSystem = await getActiveDesignSystem();

  return (
    <html
      lang="en"
      className={`${geist.variable} h-full antialiased`}
      data-design-system={activeDesignSystem}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
        <I18nScript />
      </head>
      <body
        /* pb: room for the consent banner while it is up, so a short page's
           last control can scroll clear of it. 0px once a choice is made —
           see src/components/consent/CookieBanner.tsx. */
        className="min-h-full bg-page text-fg pb-[var(--consent-banner-space,0px)]"
      >
        <Providers initialDesignSystem={activeDesignSystem}>{children}</Providers>
      </body>
    </html>
  );
}
