import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Privacy policy · BHN Training",
  description: "How BHN Training collects, uses, and protects your personal data.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-page">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/" className="text-xs text-muted hover:text-fg inline-flex items-center gap-1 mb-8">
          <ArrowLeft size={12} /> Back home
        </Link>

        <h1 className="text-3xl font-bold text-fg tracking-tight">Privacy policy</h1>
        <p className="text-sm text-subtle mt-1">Last updated: {new Date().toLocaleDateString()}</p>

        <div className="prose prose-slate dark:prose-invert mt-8 max-w-none">
          <p>
            BHN Training (&quot;we&quot;, &quot;us&quot;) operates the bhn-training platform. This page
            explains what personal data we collect, how it&apos;s used, and the rights you have under
            the General Data Protection Regulation (GDPR), the California Consumer Privacy Act
            (CCPA), and similar regulations.
          </p>

          <h2>What we collect</h2>
          <ul>
            <li><strong>Account data</strong> — name, email, hashed password, role, organization, job title, country, phone (if provided).</li>
            <li><strong>Learning data</strong> — courses you enroll in, progress, assessment scores, certificates, BHN credit transactions.</li>
            <li><strong>Application data</strong> — credit applications, role-change requests, supporting documents you upload.</li>
            <li><strong>Activity data</strong> — only with your analytics consent: page views, feature usage, theme choice, device class. Used to improve the platform; never sold.</li>
            <li><strong>Your shortcuts</strong> — while you are signed in, which platform pages you open and how long each stays on screen, so your dashboard can show your own shortcuts and most-used pages. Stored with your account only (no IP address, device or referrer), shown only to you, and not used for analytics.</li>
            <li><strong>Optional</strong> — newsletter subscription preference.</li>
          </ul>

          <h2>Legal bases for processing (GDPR Art. 6)</h2>
          <ul>
            <li><strong>Contract</strong> — to deliver the training service to you.</li>
            <li><strong>Consent</strong> — for analytics, marketing communications, and the BioHubNet newsletter.</li>
            <li><strong>Legitimate interest</strong> — security, fraud prevention, audit logging.</li>
            <li><strong>Legal obligation</strong> — record-keeping for certifications, regulatory compliance.</li>
          </ul>

          <h2>Your rights</h2>
          <p>You have the right to:</p>
          <ul>
            <li><strong>Access</strong> your data — download a complete export from the Privacy section of your profile.</li>
            <li><strong>Rectify</strong> inaccurate data — edit your info anytime in your profile.</li>
            <li><strong>Erase</strong> your account — request deletion from your profile. We retain audit trail
              and aggregate analytics in compliance with regulatory record-keeping; everything else is
              removed within 30 days.</li>
            <li><strong>Restrict or object</strong> — withdraw analytics or marketing consent anytime.</li>
            <li><strong>Portability</strong> — export your data as JSON.</li>
            <li><strong>Opt out of sale (CCPA)</strong> — we don&apos;t sell personal data. Period.</li>
            <li><strong>Lodge a complaint</strong> with your local supervisory authority.</li>
          </ul>

          <h2>Data we share</h2>
          <p>
            We use three sub-processors, all under data-processing agreements:
          </p>
          <ul>
            <li><strong>Neon</strong> (managed PostgreSQL) — application database. EU + US regions available.</li>
            <li><strong>Cloudflare</strong> (R2 object storage, Workers AI) — file storage and AI inference.</li>
            <li><strong>Vercel</strong> — application hosting, edge network.</li>
          </ul>
          <p>
            We do not sell or rent your personal information. We disclose data only when legally
            required (court order, lawful subpoena) or to the sub-processors above strictly to
            operate the service.
          </p>

          <h2>Cookies & tracking</h2>
          <p>
            We use a small number of cookies / localStorage entries:
          </p>
          <ul>
            <li><strong>Necessary</strong> — your session, theme, language. Always set.</li>
            <li><strong>Analytics</strong> — only set if you accept. Page views and feature usage,
              tied to your account when signed in.</li>
            <li><strong>Marketing</strong> — only set if you accept. Used to attribute newsletter
              signups and similar actions.</li>
          </ul>
          <p>
            You can change cookie preferences at any time from your profile.
          </p>

          <h2>Retention</h2>
          <p>
            Account and learning data are kept while your account is active. Audit log entries are
            retained for 7 years to support regulatory compliance. On deletion request, all
            other personal data is removed within 30 days.
          </p>

          <h2>Contact</h2>
          <p>
            For privacy questions or to exercise any of the rights above, reach out via the contact
            form or write to <em>privacy@biohubnet.example</em>.
          </p>
        </div>
      </div>
    </div>
  );
}
