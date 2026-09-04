import type { CSSProperties, ReactNode } from "react";
import {
  GOOGLE_ADS_ACTIVE_KEYWORDS,
  GOOGLE_ADS_AD_GROUP_NEGATIVES,
  GOOGLE_ADS_CAMPAIGN_NEGATIVES,
  GOOGLE_ADS_PILOT,
  GOOGLE_ADS_PILOT_PROGRAMS,
  GOOGLE_ADS_PROMOTION,
} from "@/lib/campaign/google-ads-pilot";
import styles from "./GoogleAdsCampaignDeck.module.css";

type ProgramId = keyof typeof GOOGLE_ADS_ACTIVE_KEYWORDS;
type Competition = "Medium" | "High";
type ProgramStyle = CSSProperties & { "--program": string };

const PROGRAMS: Record<
  ProgramId,
  {
    shortName: string;
    color: string;
    competition: Competition;
    overlap: string;
    url: string;
    headlines: readonly string[];
    descriptions: readonly string[];
  }
> = {
  engage: {
    shortName: "ENGAGE",
    color: "#8dbf2e",
    competition: "Medium",
    overlap: "Training providers and universities",
    url: "bhn-training-platform.vercel.app/for-trainees/engage",
    headlines: [
      "Master’s & PhD Biotech Skills",
      "Up to $5K Training Credits",
      "Funded Life Science Training",
      "Check Your Institution",
    ],
    descriptions: [
      "Eligible master’s, PhD and postdoc trainees can apply for up to $5K in training credits.",
      "Build GMP, regulatory and biotech skills through courses from partner institutions.",
    ],
  },
  experience: {
    shortName: "EXPERIENCE",
    color: "#00a189",
    competition: "High",
    overlap: "Job boards, universities and internship programs",
    url: "bhn-training-platform.vercel.app/for-trainees/experience",
    headlines: [
      "Biotech Jobs Need Experience",
      "Join the Biotech Talent Pool",
      "Experience for PhD Careers",
      "GTA & Montreal Opportunities",
    ],
    descriptions: [
      "Master’s, PhD and postdoc trainees: build industry experience and meet biotech employers.",
      "Looking for your first biotech role? Apply to connect with industry opportunities.",
    ],
  },
  "venture-connect": {
    shortName: "VentureConnect",
    color: "#dc4633",
    competition: "Medium",
    overlap: "Grant sites, accelerators and universities",
    url: "bhn-training-platform.vercel.app/for-trainees/venture-connect",
    headlines: [
      "Need Funding to Meet VCs?",
      "Up to $5K for Founder Travel",
      "Meet Investors Face to Face",
      "Founder Travel Grant Canada",
    ],
    descriptions: [
      "Life science founders: apply for travel support to meet investors and grow key networks.",
      "Get up to $5K toward eligible investor meetings, conferences and business travel.",
    ],
  },
};

function programStyle(color: string): ProgramStyle {
  return { "--program": color };
}

function SlideHeader({
  number,
  eyebrow,
  title,
  status,
}: {
  number: string;
  eyebrow: string;
  title: string;
  status: string;
}) {
  return (
    <header className={styles.slideHeader}>
      <span className={styles.slideNumber} aria-hidden="true">{number}</span>
      <div>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <span className={styles.status}>{status}</span>
    </header>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.fact}>
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  );
}

function NegativeTerms({ terms }: { terms: readonly string[] }) {
  return (
    <div className={styles.negativeTerms}>
      {terms.map((term) => <span key={term}>{term}</span>)}
    </div>
  );
}

export function GoogleAdsCampaignDeck() {
  return (
    <div className={styles.deck}>
      <header className={styles.deckbar}>
        <span>BioHubNet / Google Ads</span>
        <nav aria-label="Campaign dashboard navigation">
          <a href="#google-ads-keywords">Keywords</a>
          <a href="#google-ads-negatives">Negatives</a>
          <a href="#google-ads-audiences">Audiences</a>
          <a href="#google-ads-ads">Ads</a>
          <a href="#google-ads-controls">Controls</a>
        </nav>
        <span>Verified {GOOGLE_ADS_PILOT.lastVerifiedOn}</span>
      </header>

      <main className={styles.deckMain}>
        <section className={`${styles.slide} ${styles.cover}`} data-slide="01 / 06" aria-labelledby="google-ads-cover-title">
          <div className={styles.coverMain}>
            <div>
              <p className={styles.eyebrow}>Current Google Ads setup</p>
              <h1 id="google-ads-cover-title">Applications<br />Search campaign</h1>
              <p className={styles.coverCopy}>{GOOGLE_ADS_PILOT.name}</p>
              <div className={styles.stateLine}>
                <span className={styles.paused}>Paused</span>
                <span>Campaign ID {GOOGLE_ADS_PILOT.campaignId}</span>
                <span>{GOOGLE_ADS_PILOT.account}</span>
              </div>
            </div>
            <div className={styles.coverMeta}>
              <Fact label="Spend">CA$0.00</Fact>
              <Fact label="Budget">CA$19.73/day</Fact>
              <Fact label="Monthly plan">About CA$600</Fact>
              <Fact label="CPC limit">CA$4.00</Fact>
            </div>
          </div>
          <aside className={styles.coverSide}>
            <div>
              <p className={styles.eyebrow}>Scope</p>
              <strong>GTA + Montreal</strong>
              <p>English only. Google Search only. Presence targeting.</p>
            </div>
            <div className={styles.coverList}>
              <span>31 active keywords</span>
              <span>35 negative keywords</span>
              <span>3 ad groups</span>
              <span>3 responsive search ads</span>
            </div>
          </aside>
        </section>

        <section className={styles.slide} id="google-ads-keywords" data-slide="02 / 06">
          <SlideHeader number="01" eyebrow="Active now" title="Keywords" status="31 active / phrase and exact match only" />
          <div className={styles.keywordGrid}>
            {(Object.keys(PROGRAMS) as ProgramId[]).map((id) => {
              const program = PROGRAMS[id];
              return (
                <article className={styles.keywordCard} style={programStyle(program.color)} key={id}>
                  <div className={styles.cardHeading}>
                    <h3>{program.shortName}</h3>
                    <span>{GOOGLE_ADS_ACTIVE_KEYWORDS[id].length}</span>
                  </div>
                  <ul className={styles.keywordList}>
                    {GOOGLE_ADS_ACTIVE_KEYWORDS[id].map((keyword) => (
                      <li key={keyword}>
                        <strong>{keyword}</strong>
                        <span className={program.competition === "High" ? styles.high : styles.medium}>{program.competition}</span>
                        <small>{program.overlap}</small>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
          <div className={styles.note}><strong>Competition:</strong> an estimated level of overlapping search demand. It does not prove these organizations are currently buying ads. Use Auction Insights after launch for actual paid competitors.</div>
          <div className={styles.note}><strong>Partner-safe approach:</strong> no provider-brand bidding, no BioHubNet brand keywords, and no broad match. Twelve older generic ENGAGE keywords remain paused.</div>
        </section>

        <section className={styles.slide} id="google-ads-negatives" data-slide="03 / 06">
          <SlideHeader number="02" eyebrow="Spend protection" title="Negative keywords" status="35 blocked terms" />
          <article className={styles.negativePanel}>
            <div className={styles.cardHeading}>
              <h3>Campaign level</h3>
              <span>20</span>
            </div>
            <NegativeTerms terms={GOOGLE_ADS_CAMPAIGN_NEGATIVES} />
            <p>All BioHubNet spelling variants are blocked because organic results already serve brand searches. This avoids paying for clicks from people already looking for BioHubNet.</p>
          </article>
          <div className={styles.negativeGrid}>
            {(Object.keys(PROGRAMS) as ProgramId[]).map((id) => (
              <article className={styles.negativePanel} style={programStyle(PROGRAMS[id].color)} key={id}>
                <div className={styles.cardHeading}>
                  <h3>{PROGRAMS[id].shortName}</h3>
                  <span>5</span>
                </div>
                <NegativeTerms terms={GOOGLE_ADS_AD_GROUP_NEGATIVES[id]} />
              </article>
            ))}
          </div>
          <div className={styles.note}>Review actual search terms weekly. Add irrelevant queries as negatives without blocking valid trainee or founder intent.</div>
        </section>

        <section className={styles.slide} id="google-ads-audiences" data-slide="04 / 06">
          <SlideHeader number="03" eyebrow="Who we need to reach" title="Audience and search intent" status="41-institution network / 2-market pilot" />
          <div className={styles.audienceGrid}>
            {GOOGLE_ADS_PILOT_PROGRAMS.map((program) => (
              <article className={styles.audienceCard} style={programStyle(PROGRAMS[program.id].color)} key={program.id}>
                <p className={styles.eyebrow}>{program.objective}</p>
                <h3>{PROGRAMS[program.id].shortName}</h3>
                <dl>
                  <dt>Audience</dt>
                  <dd>{program.audience}</dd>
                  <dt>Intent</dt>
                  <dd>{program.intent}</dd>
                </dl>
              </article>
            ))}
          </div>
          <div className={styles.note}><strong>Current reach:</strong> people in or regularly in the GTA or Montreal. National expansion to all 41 institutions comes after this pilot produces reliable application data.</div>
        </section>

        <section className={styles.slide} id="google-ads-ads" data-slide="05 / 06">
          <SlideHeader number="04" eyebrow="Responsive Search Ads" title="Sample ad copy" status="1 paused ad per ad group" />
          <div className={styles.adGrid}>
            {(Object.keys(PROGRAMS) as ProgramId[]).map((id) => {
              const program = PROGRAMS[id];
              return (
                <article className={styles.adCard} style={programStyle(program.color)} key={id}>
                  <h3>{program.shortName}</h3>
                  <p className={styles.adUrl}>{program.url}</p>
                  <p className={styles.adTitle}>{program.headlines[0]} | {program.headlines[1]}</p>
                  <p className={styles.adDescription}>{program.descriptions[0]}</p>
                  <div className={styles.adAssets}>
                    <strong>More headlines</strong>
                    {program.headlines.slice(2).map((headline) => <span key={headline}>{headline}</span>)}
                    <strong>Second description</strong>
                    <span>{program.descriptions[1]}</span>
                  </div>
                </article>
              );
            })}
          </div>
          <div className={styles.note}>Each ad sends people to the matching Training Platform landing page with campaign and ad-group UTM tracking.</div>
        </section>

        <section className={styles.slide} id="google-ads-controls" data-slide="06 / 06">
          <SlideHeader number="05" eyebrow="Current controls" title="Budget, tracking and promotion" status="Campaign remains paused" />
          <div className={styles.controlGrid}>
            <article className={styles.controlCard}>
              <h3>Campaign settings</h3>
              <Fact label="Bid strategy">Maximize clicks</Fact>
              <Fact label="Maximum CPC">CA$4.00</Fact>
              <Fact label="Daily budget">CA$19.73</Fact>
              <Fact label="Network">Google Search only</Fact>
              <Fact label="Location">GTA + Montreal, presence only</Fact>
              <Fact label="Language">English</Fact>
              <Fact label="Automation">AI Max, broad match and auto assets off</Fact>
            </article>
            <article className={styles.controlCard}>
              <h3>Primary conversions</h3>
              {GOOGLE_ADS_PILOT_PROGRAMS.map((program) => (
                <div className={styles.conversion} key={program.id}>
                  <strong>{program.objective.replace("applications", "application submitted")}</strong>
                  <span>Google Ads conversion action configured</span>
                </div>
              ))}
              <p className={styles.smallPrint}>Count: one. Value: CA$1. Data-driven attribution. Enhanced conversions off.</p>
            </article>
            <article className={`${styles.controlCard} ${styles.promotionCard}`}>
              <p className={styles.eyebrow}>Google Ads promotion</p>
              <h3>{GOOGLE_ADS_PROMOTION.offer}</h3>
              <Fact label="Status">{GOOGLE_ADS_PROMOTION.status}</Fact>
              <Fact label="Redeemed">{GOOGLE_ADS_PROMOTION.redeemedOn}</Fact>
              <Fact label="Requirements due">{GOOGLE_ADS_PROMOTION.requirementsDueOn}</Fact>
              <p className={styles.smallPrint}>The credit is not earned yet. Spend is not accumulating while the campaign is paused. Earned credit must be used within {GOOGLE_ADS_PROMOTION.useWithinDays} days.</p>
            </article>
          </div>
          <div className={styles.launchBar}><strong>Before activation:</strong> deploy and test all three conversion events, then get launch approval. Current spend is CA$0.00.</div>
        </section>
      </main>
    </div>
  );
}
