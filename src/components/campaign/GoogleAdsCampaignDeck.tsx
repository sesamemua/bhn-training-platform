import type { CSSProperties, ReactNode } from "react";
import styles from "./GoogleAdsCampaignDeck.module.css";

type Competition = "low" | "med" | "high";

type Keyword = {
  term: string;
  context: string;
  competition: Competition;
};

type ProgramStyle = CSSProperties & { "--program": string };

const COLORS = {
  blue: "#007fa3",
  green: "#8dbf2e",
  teal: "#00a189",
  coral: "#dc4633",
};

const catalogueKeywords: readonly Keyword[] = [
  { term: '"aseptic cell culture training for beginners"', context: "Aseptic Cell Culture", competition: "high" },
  { term: '"hands on aseptic processing training canada"', context: "Aseptic Cell Culture", competition: "high" },
  { term: '"cell culture training no experience required"', context: "Aseptic Cell Culture", competition: "high" },
  { term: '"mrna lnp manufacturing training montreal"', context: "mRNA-LNP Manufacturing", competition: "high" },
  { term: '"car t cell manufacturing training canada"', context: "CAR-T Manufacturing", competition: "high" },
  { term: '"qc microbiology training for biomanufacturing"', context: "QC Microbiology", competition: "high" },
  { term: '"gmp quality control course for biotech"', context: "GMP for Quality Control", competition: "high" },
  { term: '"qa qc training for biologics manufacturing"', context: "QA/QC Pathway", competition: "high" },
  { term: '"pharmaceutical regulatory affairs course canada"', context: "Regulatory Affairs", competition: "high" },
  { term: '"health canada regulatory affairs training online"', context: "Regulatory Affairs", competition: "high" },
  { term: '"msl training program for phd graduates"', context: "MSL Accelerator", competition: "high" },
  { term: '"medical affairs course for researchers canada"', context: "Medical Affairs", competition: "high" },
  { term: '"bioprocess scale up training toronto"', context: "Bioprocess Scale-up", competition: "high" },
  { term: '"upstream and downstream bioprocessing course"', context: "Bioprocessing", competition: "high" },
  { term: '"bioreactor operations course for graduate students"', context: "Bioreactor Operations", competition: "high" },
  { term: '"protein chromatography course for bioprocessing"', context: "Chromatography", competition: "high" },
  { term: '"cleanroom behaviour training for biotech"', context: "Cleanroom Behaviour", competition: "high" },
  { term: '"quality risk management course for biopharma"', context: "QRM Modules", competition: "high" },
  { term: '"gcp clinical research course canada"', context: "GCP Fundamentals", competition: "high" },
  { term: '"health canada division 5 training online"', context: "CANTRAIN Division 5", competition: "high" },
  { term: '"clinical trial data management online course"', context: "Clinical Data Management", competition: "high" },
  { term: '"funded biotech training for postdocs canada"', context: "Training Credits", competition: "high" },
  { term: '"life science training credits for phd students"', context: "Training Credits", competition: "high" },
  { term: '"medical writing course for life science graduates"', context: "Medical Writing", competition: "med" },
];

const engageKeywords: readonly Keyword[] = [
  { term: "[biohubnet engage]", context: "Brand", competition: "low" },
  { term: "[biohubnet training credits]", context: "Brand", competition: "low" },
  { term: '"training credits for researchers"', context: "BioTalent / Mitacs", competition: "med" },
  { term: '"biotech training funding"', context: "CASTL / BioTalent", competition: "high" },
  { term: '"life science training funding"', context: "CASTL / BioTalent", competition: "high" },
  { term: '"funded gmp training for phd students"', context: "Funding-led intent", competition: "med" },
  { term: '"free biotech training for graduate students"', context: "Funding-led intent", competition: "med" },
  { term: '"life science training credits for phd students"', context: "BioHubNet-specific offer", competition: "low" },
  { term: '"funded biotech training for postdocs canada"', context: "Audience + funding", competition: "med" },
  { term: '"industry training funding for graduate students"', context: "Audience + funding", competition: "med" },
  { term: '"postdoc industry training funding"', context: "Audience + funding", competition: "med" },
  { term: '"funded biomanufacturing learning pathway"', context: "Funding-led intent", competition: "med" },
  { term: '"graduate researcher training funding"', context: "Audience + funding", competition: "med" },
  { term: '"funded lab technician training canada"', context: "Audience + funding", competition: "med" },
  { term: '"funded regulatory affairs training for phd students"', context: "Skill + funding", competition: "med" },
  { term: '"industry training funding for researchers"', context: "Audience + funding", competition: "med" },
  { term: '"funded life science professional development"', context: "Funding-led intent", competition: "med" },
];

const experienceKeywords: readonly Keyword[] = [
  { term: "[biohubnet experience]", context: "Brand", competition: "low" },
  { term: '"life science internship"', context: "Mitacs / BioTalent", competition: "high" },
  { term: '"biotech internship canada"', context: "Mitacs / BioTalent", competition: "high" },
  { term: '"biomanufacturing internship"', context: "BioTalent / job boards", competition: "high" },
  { term: '"postdoc industry internship"', context: "Mitacs", competition: "high" },
  { term: '"phd biotech internship"', context: "Mitacs / BioTalent", competition: "high" },
  { term: '"paid biotech internship"', context: "BioTalent / job boards", competition: "high" },
  { term: '"biotech jobs for phd graduates"', context: "Indeed / LinkedIn / BioTalent", competition: "high" },
  { term: '"life science jobs for masters graduates"', context: "Indeed / LinkedIn / BioTalent", competition: "high" },
  { term: '"industry jobs for postdocs"', context: "Indeed / LinkedIn / BioTalent", competition: "high" },
  { term: '"biotech jobs without industry experience"', context: "Job boards / career content", competition: "high" },
  { term: '"biotech internship toronto"', context: "Job boards / BioTalent", competition: "high" },
  { term: '"biotech internship montreal"', context: "Job boards / BioTalent", competition: "high" },
  { term: '"knowledge exchange funding"', context: "Mitacs / universities", competition: "high" },
  { term: '"funded research exchange"', context: "Mitacs", competition: "high" },
  { term: '"research placement funding"', context: "Mitacs / universities", competition: "high" },
  { term: '"biotech jobs toronto phd"', context: "Indeed / LinkedIn / BioTalent", competition: "high" },
  { term: '"life science jobs montreal phd"', context: "Indeed / LinkedIn / BioTalent", competition: "high" },
];

const equipKeywords: readonly Keyword[] = [
  { term: "[biohubnet equip]", context: "Brand", competition: "low" },
  { term: "[ventureconnect grant]", context: "Brand", competition: "low" },
  { term: '"equip ventureconnect"', context: "Brand", competition: "low" },
  { term: '"trainee entrepreneur grant"', context: "IRAP / accelerators", competition: "med" },
  { term: '"researcher entrepreneur grant"', context: "IRAP / accelerators", competition: "med" },
  { term: '"biotech startup grant"', context: "IRAP / accelerators", competition: "high" },
  { term: '"life science startup funding"', context: "IRAP / Genome Quebec", competition: "high" },
  { term: '"non dilutive biotech funding"', context: "IRAP / public funds", competition: "high" },
  { term: '"biotech commercialization funding"', context: "IRAP / Genome Quebec", competition: "high" },
  { term: '"early stage life science funding"', context: "IRAP / accelerators", competition: "high" },
  { term: '"conference travel grant canada"', context: "Universities / societies", competition: "med" },
  { term: '"investor conference grant"', context: "Accelerators / incubators", competition: "med" },
  { term: '"pitch competition funding"', context: "Accelerators", competition: "high" },
  { term: '"startup conference funding"', context: "Accelerators / universities", competition: "med" },
  { term: '"entrepreneurship workshop grant"', context: "Incubators / universities", competition: "med" },
  { term: '"founder travel funding"', context: "Incubators / universities", competition: "med" },
];

const negatives = [
  {
    name: "ENGAGE",
    count: 13,
    color: COLORS.green,
    terms: ["biotech jobs", "jobs near me", "biotech salary", "bachelor degree", "undergraduate admission", "medical school", "nursing program", "biology homework", "wikipedia", "definition", "internship", "startup funding", "travel grant"],
  },
  {
    name: "EXPERIENCE",
    count: 10,
    color: COLORS.teal,
    terms: ["undergraduate internship", "high school internship", "summer job for teens", "unpaid internship", "medical school", "nursing placement", "wikipedia", "definition", "training credits", "startup grant"],
    keepOpen: "biotech jobs / life science jobs / paid internship / internship salary / postdoc industry jobs",
  },
  {
    name: "EQUIP",
    count: 12,
    color: COLORS.coral,
    terms: ["business loan", "personal loan", "student scholarship", "vacation grant", "travel agency", "tourism grant", "startup jobs", "venture capital jobs", "government jobs", "patent attorney", "restaurant startup", "real estate startup"],
    keepOpen: "investor / VC / pitch / conference / founder travel funding",
  },
] as const;

const competitors = [
  { title: "Training market", color: COLORS.green, players: "CASTL, BioTalent Canada, Mitacs, colleges.", angle: "Applicant-side Training Credits." },
  { title: "Experience market", color: COLORS.teal, players: "Mitacs, BioTalent Canada, universities, job boards.", angle: "Research-to-industry pathway and matching." },
  { title: "Founder market", color: COLORS.coral, players: "NRC IRAP, Genome Quebec, accelerators and incubators.", angle: "Focused conference and investor-access support." },
] as const;

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

function KeywordGrid({ keywords, color }: { keywords: readonly Keyword[]; color: string }) {
  const splitAt = Math.ceil(keywords.length / 2);
  const columns = [keywords.slice(0, splitAt), keywords.slice(splitAt)];

  return (
    <div className={styles.keywordLayout}>
      {columns.map((column, columnIndex) => (
        <ul
          className={styles.keywordList}
          style={programStyle(color)}
          key={`${column[0]?.term ?? "keywords"}-${columnIndex}`}
        >
          {column.map((keyword) => (
            <li key={keyword.term}>
              <strong>{keyword.term}</strong>
              <small>{keyword.context}</small>
              <span className={`${styles.level} ${styles[keyword.competition]}`}>
                {keyword.competition}
              </span>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

function KeywordFooter({ children }: { children: ReactNode }) {
  return <div className={styles.keywordFooter}>{children}</div>;
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

export function GoogleAdsCampaignDeck() {
  return (
    <div className={styles.deck}>
      <header className={styles.deckbar}>
        <span>BioHubNet / Google Ads pilot</span>
        <nav aria-label="Campaign deck navigation">
          <a href="#google-ads-catalogue">Catalogue</a>
          <a href="#google-ads-engage">ENGAGE</a>
          <a href="#google-ads-experience">EXPERIENCE</a>
          <a href="#google-ads-equip">EQUIP</a>
          <a href="#google-ads-competitors">Competitors</a>
          <a href="#google-ads-costs">Costs</a>
          <a href="#google-ads-partners">Partner split</a>
          <a href="#google-ads-ads">Ads</a>
          <a href="#google-ads-budget">Budget</a>
        </nav>
        <span>September 2026</span>
      </header>

      <div className={styles.deckMain}>
        <section className={`${styles.slide} ${styles.cover}`} data-slide="01 / 10" aria-labelledby="google-ads-cover-title">
          <div className={styles.coverMain}>
            <div>
              <p className={styles.eyebrow}>GTA + Greater Montreal / English Search</p>
              <h1 id="google-ads-cover-title">Google Ads<br />pilot plan</h1>
              <p className={styles.coverCopy}>
                Turn high-intent searches into ENGAGE enrollments, EXPERIENCE applications and EQUIP VentureConnect applications.
              </p>
            </div>
            <div className={styles.coverMeta}>
              <span>51 launch keywords</span>
              <span>28 catalogue candidates</span>
              <span>35 negatives</span>
              <span>3 campaigns</span>
            </div>
          </div>
          <aside className={styles.coverSide}>
            <div>
              <p className={styles.eyebrow}>Recommended budget</p>
              <strong>$600</strong>
              <p>per month</p>
            </div>
            <div>
              <h3>Launch position</h3>
              <p>Exact and phrase match only. Google Search only. Billing added after tracking is tested.</p>
            </div>
          </aside>
        </section>

        <section className={styles.slide} id="google-ads-catalogue" data-slide="02 / 10">
          <SlideHeader
            number="01"
            eyebrow="Course catalogue research"
            title="Long-tail searches trainees may use"
            status="24 shown / 28 in research CSV"
          />
          <KeywordGrid keywords={catalogueKeywords} color={COLORS.blue} />
          <KeywordFooter>
            <span><strong>Priority logic:</strong> specific skill + learner + format or location.</span>
            <span><strong>Next check:</strong> Keyword Planner volume, CPC and duplication.</span>
          </KeywordFooter>
          <p className={styles.sourceNote}>
            Extracted from BioHubNet&apos;s <ExternalLink href="https://biohubnet.ca/download/BHN%20ENGAGE%20On-Demand%20Catalogue%20-%20Spring%202026.pdf">Spring 2026 On-Demand Catalogue</ExternalLink> and current <ExternalLink href="https://biohubnet.ca/engage/">ENGAGE learning pathways</ExternalLink>. Priority is strategic relevance, not measured search volume.
          </p>
        </section>

        <section className={styles.slide} id="google-ads-engage" data-slide="03 / 10">
          <SlideHeader number="02" eyebrow="Keyword plan" title="ENGAGE" status="17 launch keywords / $300 per month" />
          <KeywordGrid keywords={engageKeywords} color={COLORS.green} />
          <KeywordFooter>
            <span><strong>Best opportunity:</strong> BioHubNet brand, funding, eligibility and Training Credit terms.</span>
            <span><strong>Partner-safe:</strong> direct course terms move out of the launch list.</span>
          </KeywordFooter>
          <p className={styles.sourceNote}>Competitor and High / Med / Low labels estimate overlapping search results and offers. They do not confirm that an organization is currently paying for Google Ads.</p>
        </section>

        <section className={styles.slide} id="google-ads-experience" data-slide="04 / 10">
          <SlideHeader number="03" eyebrow="Keyword plan" title="EXPERIENCE" status="18 keywords / $180 per month" />
          <KeywordGrid keywords={experienceKeywords} color={COLORS.teal} />
          <KeywordFooter>
            <span><strong>Best opportunity:</strong> graduate-level job, internship and experience-gap searches.</span>
            <span><strong>Risk:</strong> job intent is relevant, but undergraduate and teen traffic is not.</span>
          </KeywordFooter>
          <p className={styles.sourceNote}>Competitor and High / Med / Low labels estimate overlapping search results and offers. They do not confirm that an organization is currently paying for Google Ads.</p>
        </section>

        <section className={styles.slide} id="google-ads-equip" data-slide="05 / 10">
          <SlideHeader number="04" eyebrow="Keyword plan" title="EQUIP VentureConnect" status="16 keywords / $120 per month" />
          <KeywordGrid keywords={equipKeywords} color={COLORS.coral} />
          <KeywordFooter>
            <span><strong>Best opportunity:</strong> VentureConnect brand and targeted conference terms.</span>
            <span><strong>Risk:</strong> broad startup-funding intent is expensive and often mismatched.</span>
          </KeywordFooter>
          <p className={styles.sourceNote}>Competitor and High / Med / Low labels estimate overlapping search results and offers. They do not confirm that an organization is currently paying for Google Ads.</p>
        </section>

        <section className={styles.slide} id="google-ads-competitors" data-slide="06 / 10">
          <SlideHeader number="05" eyebrow="Spend protection" title="Negatives and competitors" status="35 blocked terms" />
          <div className={styles.negativeGrid}>
            {negatives.map((group) => (
              <article className={styles.negativeCard} style={programStyle(group.color)} key={group.name}>
                <h3>{group.name} / {group.count}</h3>
                <p>
                  {group.terms.map((term, index) => (
                    <span key={term}>{index > 0 ? " / " : ""}{term}</span>
                  ))}
                </p>
                {"keepOpen" in group ? (
                  <p className={styles.keepOpen}><strong>Keep open:</strong> {group.keepOpen}</p>
                ) : null}
              </article>
            ))}
          </div>
          <div className={styles.competitorGrid}>
            {competitors.map((competitor) => (
              <article className={styles.competitorCard} style={programStyle(competitor.color)} key={competitor.title}>
                <h3>{competitor.title}</h3>
                <p><strong>Players:</strong> {competitor.players}</p>
                <p><strong>BioHubNet angle:</strong> {competitor.angle}</p>
              </article>
            ))}
          </div>
          <p className={styles.sourceNote}>
            <strong>Important:</strong> these organizations have overlapping offers and may appear in organic or paid results. We have not confirmed that they are currently buying Google Ads. Sources: <ExternalLink href="https://www.castlcanada.ca/en/news-details/2026-course-catalogue-press-release">CASTL</ExternalLink> / <ExternalLink href="https://www.mitacs.ca/programs-resources/programs/">Mitacs</ExternalLink> / <ExternalLink href="https://www.biotalent.ca/programs/">BioTalent Canada</ExternalLink> / <ExternalLink href="https://nrc.canada.ca/en/support-technology-innovation/financial-support-technology-innovation">NRC IRAP</ExternalLink> / <ExternalLink href="https://genomequebec.com/en/ongoing-competitions/">Genome Quebec</ExternalLink>. Confirm active paid competitors with Google searches before launch and Auction Insights after launch.
          </p>
        </section>

        <section className={styles.slide} id="google-ads-costs" data-slide="07 / 10">
          <SlideHeader number="06" eyebrow="Planning estimates" title="Keyword cost reality" status="Replace with Keyword Planner data" />
          <div className={styles.costLayout}>
            <div className={styles.tableScroll}>
              <table className={styles.costTable}>
                <caption className={styles.srOnly}>Estimated keyword cost ranges</caption>
                <thead><tr><th>Keyword type</th><th>Est. CPC CAD</th><th>Action</th></tr></thead>
                <tbody>
                  <tr><td>BioHubNet brand</td><td>$0.50-$2.50</td><td>Keep</td></tr>
                  <tr><td>Training credits and funding</td><td>$1.50-$5</td><td>Prioritize</td></tr>
                  <tr><td>Graduate and postdoc long-tail</td><td>$2-$6</td><td>Prioritize</td></tr>
                  <tr><td>Generic course terms</td><td>$5-$12</td><td>Pause or cap</td></tr>
                  <tr><td>Startup and VC funding</td><td>$6-$15</td><td>Use selectively</td></tr>
                </tbody>
              </table>
              <p className={styles.sourceNote}>Planning ranges, not Google quotes. Keyword Planner requires completed billing before it shows account-specific competition and top-of-page bid ranges.</p>
            </div>
            <div className={styles.costCallouts}>
              <article style={programStyle(COLORS.coral)}><p className={styles.eyebrow}>If average CPC is $8</p><strong>About 75 clicks</strong><p>Generic competition can consume the full $600 monthly budget quickly.</p></article>
              <article style={programStyle(COLORS.green)}><p className={styles.eyebrow}>If average CPC is $3</p><strong>About 200 clicks</strong><p>Funding, eligibility and audience-specific long-tail terms can stretch the same budget.</p></article>
              <article style={programStyle(COLORS.blue)}><p className={styles.eyebrow}>Launch rule</p><strong>90 / 10</strong><p>Put 90% of ENGAGE spend on funding and eligibility intent; reserve 10% for capped course-term experiments.</p></article>
            </div>
          </div>
          <p className={styles.sourceNote}>Google defines competition as advertiser density for the selected location and network. Low and high top-of-page bids represent historical bid ranges, not a guaranteed CPC.</p>
        </section>

        <section className={styles.slide} id="google-ads-partners" data-slide="08 / 10">
          <SlideHeader number="07" eyebrow="Partner-safe acquisition" title="Do not compete for the course itself" status="Split search intent" />
          <div className={styles.strategySplit}>
            <article className={styles.intentCard} style={programStyle(COLORS.coral)}>
              <p className={styles.eyebrow}>Course provider owns</p>
              <h3>Direct course and registration intent</h3>
              <p>Providers such as CASTL should capture searches from people choosing a course, schedule, delivery location or direct registration.</p>
              <div className={styles.termBlock}>gmp course / biomanufacturing training / cell culture course / regulatory affairs course / CASTL schedule / course price</div>
            </article>
            <article className={styles.intentCard} style={programStyle(COLORS.green)}>
              <p className={styles.eyebrow}>BioHubNet owns</p>
              <h3>Funding, eligibility and access intent</h3>
              <p>BioHubNet should capture eligible trainees who need funding and a route into partner-delivered training.</p>
              <div className={`${styles.termBlock} ${styles.termBlockKeep}`}>training credits / funded training / free for eligible trainees / PhD and postdoc funding / institution eligibility / BioHubNet apply</div>
            </article>
          </div>
          <div className={styles.governance}><strong>Shared search agreement:</strong> BioHubNet avoids provider-brand bidding unless co-branded ads are approved. Providers exclude BioHubNet brand, Training Credit, eligibility and application terms. Review Search Terms weekly and Auction Insights after launch.</div>
          <KeywordFooter>
            <span><strong>BioHubNet message:</strong> apply for access to partner-delivered training.</span>
            <span><strong>Provider message:</strong> choose and register for the course.</span>
          </KeywordFooter>
          <p className={styles.sourceNote}>This positions partners as the delivery experts and BioHubNet as the funding, curation and access layer. It reduces internal bid competition while keeping the learner journey connected.</p>
        </section>

        <section className={styles.slide} id="google-ads-ads" data-slide="09 / 10">
          <SlideHeader number="08" eyebrow="Creative examples" title="Sample Search ads" status="41-institution network / 2-city pilot" />
          <div className={styles.adGrid}>
            <article className={styles.adCard} style={programStyle(COLORS.green)}>
              <h3>ENGAGE</h3>
              <span className={styles.audienceTag}>Master&apos;s / PhD / Postdoc / STEM</span>
              <p className={styles.problemBox}><strong>The problem:</strong> strong academic training, but limited GMP, bioprocessing and industry-ready skills.</p>
              <p className={styles.adUrl}>biohubnet.ca / engage / training</p>
              <p className={styles.adTitle}>Master&apos;s &amp; PhD Biotech Skills | Up to $5K Training Credits</p>
              <p className={styles.adDesc}>Studying biotech, biology, STEM, medicine or life sciences? Build skills beyond the lab.</p>
              <div className={styles.assets}><p><strong>Other headlines</strong></p><p>GMP Training for Grad Students</p><p>Biotech Courses for Postdocs</p><p>From Research to Industry</p><br /><p><strong>Second description</strong></p><p>Eligible trainees can receive up to $5,000 in Training Credits for 60+ courses.</p></div>
            </article>
            <article className={styles.adCard} style={programStyle(COLORS.teal)}>
              <h3>EXPERIENCE</h3>
              <span className={styles.audienceTag}>Master&apos;s / PhD / Postdoc / Job seekers</span>
              <p className={styles.problemBox}><strong>The problem:</strong> biotech jobs ask for industry experience, but academic candidates need a first opportunity.</p>
              <p className={styles.adUrl}>biohubnet.ca / experience / apply</p>
              <p className={styles.adTitle}>Biotech Jobs Need Experience | Get Your Foot in the Door</p>
              <p className={styles.adDesc}>Join the talent pool for paid industry placements and employer matching.</p>
              <div className={styles.assets}><p><strong>Other headlines</strong></p><p>Paid Industry Placements</p><p>For Master&apos;s, PhD &amp; Postdocs</p><p>Career Advisor Support</p><br /><p><strong>Second description</strong></p><p>Refine your resume, interview sample and elevator pitch for life science employers.</p></div>
            </article>
            <article className={styles.adCard} style={programStyle(COLORS.coral)}>
              <h3>EQUIP VentureConnect</h3>
              <span className={styles.audienceTag}>Graduate founders / Early-stage ventures</span>
              <p className={styles.problemBox}><strong>The problem:</strong> the right investor may be at a conference, but travel and registration cost money.</p>
              <p className={styles.adUrl}>biohubnet.ca / equip / ventureconnect</p>
              <p className={styles.adTitle}>Need Funding to Meet VCs? | Up to $5K for Founder Travel</p>
              <p className={styles.adDesc}>Get support for investor meetings, pitch events and industry conferences.</p>
              <div className={styles.assets}><p><strong>Other headlines</strong></p><p>Fund Your Next Investor Trip</p><p>Cover Travel and Registration</p><p>No Matching Funds Required</p><br /><p><strong>Second description</strong></p><p>For trainee founders with human-health ventures at eligible BioHubNet institutions.</p></div>
            </article>
          </div>
          <div className={styles.targetingCallout}><strong>Targeting plan:</strong> keep three program campaigns and target only people in GTA and Greater Montreal. Use institution-specific ad groups only for eligible local universities with enough search volume; keep one shared campaign per program so the $600 budget can learn.</div>
          <p className={styles.sourceNote}>Audience and claims are based on current <ExternalLink href="https://biohubnet.ca/engage/">ENGAGE</ExternalLink>, <ExternalLink href="https://biohubnet.ca/experience/">EXPERIENCE</ExternalLink> and <ExternalLink href="https://biohubnet.ca/equip">EQUIP</ExternalLink> pages. Draft copy. Confirm institution eligibility and deadlines before launch.</p>
        </section>

        <section className={styles.slide} id="google-ads-budget" data-slide="10 / 10">
          <SlideHeader number="09" eyebrow="Plan and controls" title="Budget and launch" status="All campaigns paused" />
          <div className={styles.budgetLayout}>
            <div className={styles.tableScroll}>
              <table>
                <caption className={styles.srOnly}>Campaign budget</caption>
                <thead><tr><th>Campaign</th><th>Goal</th><th>Monthly</th><th>Daily</th></tr></thead>
                <tbody>
                  <tr><td>ENGAGE</td><td>Enrollments</td><td>$300</td><td>$9.86</td></tr>
                  <tr><td>EXPERIENCE</td><td>Applications</td><td>$180</td><td>$5.92</td></tr>
                  <tr><td>EQUIP VentureConnect</td><td>Grant applications</td><td>$120</td><td>$3.95</td></tr>
                  <tr><td>Total</td><td></td><td>$600</td><td>$19.73</td></tr>
                </tbody>
              </table>
            </div>
            <div className={styles.checklist}>
              <article style={programStyle(COLORS.blue)}><h3>Settings</h3><ul><li>English only</li><li>GTA and Greater Montreal</li><li>Google Search only</li><li>Search Partners and Display off</li><li>Presence-only targeting</li></ul></article>
              <article style={programStyle(COLORS.coral)}><h3>Before launch</h3><ul><li>Confirm goals and deadlines</li><li>Confirm claims and eligibility</li><li>Test conversion tracking</li><li>Import into Google Ads Editor</li><li>Add billing when ready</li></ul></article>
            </div>
          </div>
          <div className={styles.approval}>Approve the $600 monthly budget, keyword lists, negatives and 50% / 30% / 20% split.</div>
        </section>
      </div>
    </div>
  );
}
