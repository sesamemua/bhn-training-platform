/**
 * EQUIP funded-recipient roster — the single source of truth for both the
 * /admin/equip/tracker dossier and the public recipients feed. Extracted from
 * the old inline DATA object; edit HERE going forward (a rescan pastes the new
 * curated set into this array).
 *
 * `project` is the VentureLift project name (VC has none). Pre-filled from the
 * funding DB (EquipApplication.formData.projectTitle) where the company name
 * matched; fill any blanks by hand.
 */
export type EquipTrack = "VC" | "VL" | "Both";
export interface EquipRecipientLink { label: string; url: string }
export interface EquipRecipientPost { when: string; text: string; type: string; hl?: boolean; src?: string | null; url?: string | null }
export interface EquipRecipient {
  name: string;
  track: EquipTrack;
  rounds: string;
  founder: string;
  inst: string;
  linkedin: EquipRecipientLink | null;
  website: EquipRecipientLink | null;
  status: string;
  statusText: string;
  posts: EquipRecipientPost[];
  /** VentureLift project name (curated; VC recipients have none). */
  project?: string;
}

export const EQUIP_UPDATED = "2026-11-24";

export const EQUIP_RECIPIENTS: EquipRecipient[] = [
    {
      "name": "Rayyan Therapeutics",
      "track": "VC",
      "rounds": "VC R1",
      "founder": "Hasam Madarati",
      "inst": "McMaster University",
      "linkedin": {
        "label": "company/rayyantherapeutics",
        "url": "https://www.linkedin.com/company/rayyantherapeutics/"
      },
      "website": null,
      "status": "web",
      "statusText": "LinkedIn active — website offline (domain disconnected)",
      "posts": [
        {
          "when": "Nov 2025",
          "text": "Co-founder and CEO Hasam Madarati shared the audience-voted People’s Choice Award at McMaster’s Postdoc Entrepreneur Fellowship pitch event for the company’s extended-window stroke treatment.",
          "type": "Award",
          "hl": false,
          "src": "McMaster Research & Innovation",
          "url": "https://research.mcmaster.ca/postdoc-entrepreneur-nathan-mullins-awarded-75000-fellowship-to-advance-biotech-solution/"
        },
        {
          "when": "Mar 2025",
          "text": "Co-founders Hasam Madarati and Colin Kretz published the company’s protease-resistant ADAMTS13 variant in Blood Advances, with patent protection disclosed.",
          "type": "Milestone",
          "hl": false,
          "src": "Blood Advances",
          "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC12159909/"
        },
        {
          "when": "~7 mo ago",
          "text": "Announced joining the 2025–2026 ECHO commercialization cohort.",
          "type": "Milestone",
          "hl": true,
          "src": "LinkedIn post",
          "url": "https://www.linkedin.com/company/rayyantherapeutics/posts/"
        }
      ]
    },
    {
      "name": "Neuropeutics Inc.",
      "track": "Both",
      "rounds": "VC R1, R6 · VL R1",
      "founder": "Marc Shenouda",
      "inst": "University of Toronto",
      "linkedin": {
        "label": "company/neuropeutics-inc",
        "url": "https://ca.linkedin.com/company/neuropeutics-inc"
      },
      "website": {
        "label": "neuropeutics.ca",
        "url": "https://neuropeutics.ca"
      },
      "status": "live",
      "statusText": "LinkedIn + website active",
      "posts": [
        {
          "when": "Oct 2026",
          "text": "Won the General Health Stream at ECHO PITCH 2026, receiving $100,000 in non-dilutive funding for its small-molecule ALS drug program.",
          "type": "Award",
          "hl": true,
          "src": "Temerty Medicine MedCP (LinkedIn post)",
          "url": "https://www.linkedin.com/posts/commercialization-and-partnerships-medcp-temerty-faculty-of-medicine-university-of-toronto_celebrating-the-winners-of-echo-pitch-activity-7521671002066673664-JMEy"
        },
        {
          "when": "Mar 2026",
          "text": "Secured $882,188 through Genome Canada and Ontario Genomics' Regional Genomic Applications Partnership Program for a two-year project to optimize JRMS and select a lead candidate for clinical trials.",
          "type": "Funding",
          "hl": true,
          "src": "Ontario Brain Institute",
          "url": "https://braininstitute.ca/news-events/2026/obi-nerve-2025-cohort-company-neuropeutics-secures-882-188-to-advance-groundbreaking-als-therapy"
        },
        {
          "when": "Nov 2025",
          "text": "Named one of eight awardees of CABHI's Fuel program, which distributed $2.8M to advance Canadian brain-health companies.",
          "type": "Funding",
          "hl": false,
          "src": "Cision Newswire",
          "url": "https://www.newswire.ca/news-releases/cabhi-announces-2-8-million-to-advance-the-canadian-brain-economy-866488691.html"
        },
        {
          "when": "Sep 2025",
          "text": "Selected for the Ontario Brain Institute's NERVE program, receiving $100,000 in non-dilutive funding plus a 12-month mentorship program.",
          "type": "Funding",
          "hl": true,
          "src": "Cision Newswire",
          "url": "https://www.newswire.ca/news-releases/breaking-barriers-in-brain-health-ontario-brain-institute-invests-500k-in-next-generation-neurotech-innovations-836360025.html"
        },
        {
          "when": "Jun 2026",
          "text": "Selected into the MassChallenge Switzerland & UK 2026 Healthtech cohort — 189 finalists from 1,961 applicants across 47 countries, competing for up to CHF 1M in equity-free prizes.",
          "type": "Recognition",
          "hl": true,
          "src": "MassChallenge",
          "url": "https://masschallenge.org/news/switzerland-uk-2026-cohort/"
        },
        {
          "when": "Jun 2026",
          "text": "Won second prize and the People’s Choice Investment Award at the IDEA Mississauga Step-Up Pitch & Showcase; CEO Marc Shenouda received the 2025 Temerty Innovation Prize for Student Entrepreneurship.",
          "type": "Award",
          "hl": false,
          "src": "Neuropeutics news",
          "url": "https://neuropeutics.ca/news.html"
        },
        {
          "when": "Mar 2026",
          "text": "Co-founder and CSO Janice Robertson awarded a $500,000 three-year ALS Canada–Brain Canada Development Grant to advance the importin-β1 modulator behind the JRMS compound.",
          "type": "Funding",
          "hl": true,
          "src": "ALS Society of Canada",
          "url": "https://als.ca/news/als-canada-and-brain-canada-award-1-5-million-to-six-research-teams-driving-discovery-in-als-research/"
        },
        {
          "when": "Jan 2026",
          "text": "Peer-reviewed paper on JRMS, the lead small molecule, published in Neurotherapeutics.",
          "type": "Milestone",
          "hl": false,
          "src": "Neurotherapeutics",
          "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC12976485/"
        },
        {
          "when": "May 2025",
          "text": "Received the inaugural AbbVie Biotech Innovators Award — SpinUp lab space plus mentorship.",
          "type": "Award",
          "hl": true,
          "src": "UTM news",
          "url": "https://www.utm.utoronto.ca/main-news/brain-health-startup-join-spinup-first-abbvie-biotech-innovators-award-winner"
        },
        {
          "when": "2025",
          "text": "Partnered with UK charity LifeArc to develop an ALS / neurodegeneration drug (JRMS-22).",
          "type": "Partnership",
          "hl": true,
          "src": "Temerty Medicine",
          "url": "https://temertymedicine.utoronto.ca/news/u-t-alums-start-neuropeutics-gets-boost-uk-based-charity"
        }
      ],
      "project": "Enabling Pre-seed Round Raise for the Development of Small Molecule Targeting TDP-43 Protein Aggregation for the Treatment of Neurodegenerative Diseases"
    },
    {
      "name": "HDAX Therapeutics",
      "track": "VC",
      "rounds": "VC R1",
      "founder": "Nabanita Nawar",
      "inst": "University of Toronto",
      "linkedin": {
        "label": "company/hdaxtx",
        "url": "https://www.linkedin.com/company/hdaxtx"
      },
      "website": {
        "label": "hdaxtx.com",
        "url": "https://hdaxtx.com"
      },
      "status": "live",
      "statusText": "LinkedIn + website active",
      "posts": [
        {
          "when": "Jun 2026",
          "text": "CEO Nabanita Nawar took investor meetings at BIO International 2026 in San Diego; the team also attended PKDCON 2026 in Chicago on its oral HDAC6 inhibitor for ADPKD.",
          "type": "Milestone",
          "hl": false,
          "src": "LinkedIn",
          "url": "https://www.linkedin.com/company/hdaxtx"
        },
        {
          "when": "Jan 2026",
          "text": "Presented as an Ontario delegate at Biotech Showcase 2026 in San Francisco, confirming ADPKD as lead indication with development-candidate nomination as the current goal.",
          "type": "Milestone",
          "hl": false,
          "src": "Source from Ontario",
          "url": "https://www.sourcefromontario.com/en/page/delegate/138313/hdax-therapeutics"
        },
        {
          "when": "Sep 2024",
          "text": "Closed an oversubscribed ~CA$4.3M seed round (SeedFolio, FACIT, TIAP).",
          "type": "Funding",
          "hl": true,
          "src": "H2i / U of T",
          "url": "https://h2i.utoronto.ca/2024/09/20/hdax-therapeutics-closes-4-3-million-seed-round/"
        },
        {
          "when": "2023",
          "text": "Co-founders Nabanita Nawar & Pimyupa Manaswiyoungkul named to Forbes 30 Under 30 (Toronto).",
          "type": "Recognition",
          "hl": true,
          "src": "Endless Frontier Labs",
          "url": "https://endlessfrontierlabs.com/hdax-therapeutics-co-founders-nabanita-nawar-and-pimyupa-manaswiyoungkul-have-been-featured-on-forbes-30-under-30-local-toronto/"
        },
        {
          "when": "~2 mo ago",
          "text": "Fraud alert regarding fraudulent job offers using HDAX's name.",
          "type": "Notice",
          "hl": false,
          "src": "LinkedIn",
          "url": "https://www.linkedin.com/company/hdaxtx/posts/"
        }
      ]
    },
    {
      "name": "Fibra Inc.",
      "track": "VC",
      "rounds": "VC R1",
      "founder": "Milad Ghalamboran · fdr. Parnian Majd",
      "inst": "University of Toronto / TMU",
      "linkedin": {
        "label": "company/myfibra",
        "url": "https://www.linkedin.com/company/myfibra/"
      },
      "website": {
        "label": "myfibra.com",
        "url": "https://myfibra.com"
      },
      "status": "live",
      "statusText": "LinkedIn + website active (moved to myfibra.com)",
      "posts": [
        {
          "when": "May 2026",
          "text": "Named to NACO’s Canada’s Top Moonshot Ventures 2026 (healthtech/biotech), with CEO Parnian Majd pitching at the closed-door showcase at NACO Summit 2026 in Ottawa.",
          "type": "Recognition",
          "hl": true,
          "src": "NACO",
          "url": "https://finance.yahoo.com/sectors/technology/articles/canadas-top-moonshot-ventures-2026-140100668.html"
        },
        {
          "when": "Apr 2026",
          "text": "Founder and CEO Parnian Majd named to the Canadian Life Sciences Top 20 Under 40.",
          "type": "Award",
          "hl": true,
          "src": "Top 20 Under 40 Life Sciences",
          "url": "https://www.top20under40lifesciences.com/2025winners/"
        },
        {
          "when": "Aug 2024",
          "text": "Closed an oversubscribed US$1.25M (≈CA$1.7M) pre-seed round for its smart-underwear women's-health platform.",
          "type": "Funding",
          "hl": true,
          "src": "Femtech Insider",
          "url": "https://femtechinsider.com/fibra-pre-seed/"
        },
        {
          "when": "~2 wk ago",
          "text": "Featured in Emmeline Ventures' “10 Companies in Fertility to Watch.”",
          "type": "Recognition",
          "hl": true,
          "src": "LinkedIn post",
          "url": "https://www.linkedin.com/company/myfibra/posts/"
        }
      ]
    },
    {
      "name": "Re:pair Genomics",
      "track": "VC",
      "rounds": "VC R2",
      "founder": "Luca Hategan · Yosuke Niibori",
      "inst": "University of Toronto",
      "linkedin": {
        "label": "company/repair-genomics",
        "url": "https://www.linkedin.com/company/repair-genomics"
      },
      "website": {
        "label": "repairgenomics.com",
        "url": "https://repairgenomics.com"
      },
      "status": "live",
      "statusText": "LinkedIn + website active",
      "posts": [
        {
          "when": "Apr 2026",
          "text": "Named runner-up at the FemSTEM Pitch Competition.",
          "type": "Award",
          "hl": false,
          "src": "LinkedIn",
          "url": "https://ca.linkedin.com/company/re-pair-genomics"
        },
        {
          "when": "Mar 2026",
          "text": "Placed top 4 in the Digital Health Tech stream at the Elevator Pitch International Competition (EPIC), and joined the Canada–Korea AI x Life Sciences forum via the CLIP-PDA mission.",
          "type": "Award",
          "hl": false,
          "src": "Re:pair news",
          "url": "https://repairgenomics.com/news/"
        },
        {
          "when": "Jan 2026",
          "text": "Filed a US provisional patent covering 30+ CNS-related promoters; co-founder Luca Hategan named one of 12 national finalists in Enactus Canada’s 2026 Student Entrepreneur competition.",
          "type": "Milestone",
          "hl": true,
          "src": "Re:pair news",
          "url": "https://repairgenomics.com/news/"
        },
        {
          "when": "Nov 2025",
          "text": "Awarded a $105,000 Mitacs grant to design cross-species-reactive compact promoters for cell-type-specific targeting.",
          "type": "Funding",
          "hl": true,
          "src": "Re:pair news",
          "url": "https://repairgenomics.com/news/"
        }
      ]
    },
    {
      "name": "MVT in Silico Corp.",
      "track": "VC",
      "rounds": "VC R2, R5",
      "founder": "Yihang Cheng",
      "inst": "Western University",
      "linkedin": {
        "label": "company/mvt-in-silico-corp",
        "url": "https://ca.linkedin.com/company/mvt-in-silico-corp"
      },
      "website": {
        "label": "mvtinsilico.ca",
        "url": "https://mvtinsilico.ca"
      },
      "status": "live",
      "statusText": "LinkedIn + website active · mostly reposts",
      "posts": [
        {
          "when": "Apr 2026",
          "text": "Exhibited its MVT Physiology Engine at the Ontario Centre of Innovation’s DiscoveryX 2026 conference in Toronto.",
          "type": "Milestone",
          "hl": false,
          "src": "Company news",
          "url": "https://www.mvtinsilico.ca/news.html"
        },
        {
          "when": "Feb 2026",
          "text": "Announced a dermal drug-administration digital twin for assessing delivery through skin, following a January cardiotoxicity assay release.",
          "type": "Product",
          "hl": false,
          "src": "Company news",
          "url": "https://www.mvtinsilico.ca/news.html"
        },
        {
          "when": "~6 days ago",
          "text": "Repost: Insilico Medicine conference panel (industry repost, not original news).",
          "type": "Repost",
          "hl": false,
          "src": "LinkedIn",
          "url": "https://www.linkedin.com/company/mvt-in-silico-corp/posts/"
        }
      ]
    },
    {
      "name": "HormonaLab",
      "track": "VC",
      "rounds": "VC R3",
      "founder": "Nancy Tahmo",
      "inst": "University of Toronto",
      "linkedin": null,
      "website": {
        "label": "hormonalab.com",
        "url": "https://hormonalab.com"
      },
      "status": "web",
      "statusText": "Website only — no LinkedIn page found",
      "posts": [
        {
          "when": "2025",
          "text": "Menopause care via predictive modelling + wearables; EQUIP recipient. No LinkedIn company page found.",
          "type": "Web only",
          "hl": false,
          "src": "hormonalab.com",
          "url": "https://hormonalab.com"
        }
      ]
    },
    {
      "name": "NephroTech",
      "track": "VC",
      "rounds": "VC R3",
      "founder": "Ria Khan",
      "inst": "University of Toronto",
      "linkedin": null,
      "website": null,
      "status": "none",
      "statusText": "No company page / website — founder profile only",
      "posts": [
        {
          "when": "Jan 2026",
          "text": "Co-founder Ria Khan named one of twelve national finalists in Enactus Canada’s 2026 Student Entrepreneur National Competition.",
          "type": "Recognition",
          "hl": false,
          "src": "Enactus Canada",
          "url": "https://enactus.ca/student-entrepreneur/meet-12-of-canadas-top-post-secondary-entrepreneurs/"
        },
        {
          "when": "Dec 2025",
          "text": "Profiled by U of T’s Centre for Entrepreneurship as one of 22 teams worldwide reaching the Hult Prize Global Finals, targeting a Canadian pilot by 2028.",
          "type": "Recognition",
          "hl": false,
          "src": "UofT Centre for Entrepreneurship",
          "url": "https://www.entrepreneurship.artsci.utoronto.ca/news/hult-prize-u-t-top-22-finalists-nephrotech-share-their-global-ambitions"
        },
        {
          "when": "Nov 2025",
          "text": "One of three ventures awarded a $5,000 Student Innovation Fellowship at U of T Health Innovation Hub (H2i) Pitch Perfect 2025.",
          "type": "Funding",
          "hl": false,
          "src": "H2i",
          "url": "https://h2i.utoronto.ca/2025/11/13/announcing-the-winners-of-pitch-perfect-2025/"
        }
      ]
    },
    {
      "name": "NewGen Health",
      "track": "Both",
      "rounds": "VC R5, R12 · VL R4",
      "founder": "Mazhar Shahen",
      "inst": "University of Waterloo",
      "linkedin": {
        "label": "company/newgen-health",
        "url": "https://www.linkedin.com/company/newgen-health/"
      },
      "website": {
        "label": "newgenhealth.io",
        "url": "https://newgenhealth.io"
      },
      "status": "live",
      "statusText": "LinkedIn + website active",
      "posts": [
        {
          "when": "Sep 2026",
          "text": "Won the $30,000 top prize at Innovation Factory's 16th annual LiONS LAIR pitch competition.",
          "type": "Award",
          "hl": false,
          "src": "Innovation Factory",
          "url": "https://innovationfactory.ca/meet-the-winners-of-innovation-factorys-16th-annual-lions-lair-pitch-competition/"
        },
        {
          "when": "Sep 2026",
          "text": "Co-founder Mazhar Shahen was one of five finalists at the inaugural Mitacs Health Innovation Showcase at Brampton Venture Expo 2026; NewGen did not place among the three award winners.",
          "type": "Recognition",
          "hl": false,
          "src": "Toronto Metropolitan University",
          "url": "https://www.torontomu.ca/zone-learning/venture-zone-brampton/news-events/2026/09/mitacs-health-innovation-showcase-debuts-at-bvx-2026-awarding-80-000-in-prizes-to-brampton-health-tech-startups/"
        },
        {
          "when": "Nov 2025",
          "text": "Co-founder Mazhar Shahen was named one of the University of Waterloo's 10 entrepreneurs to watch for NewGen's automated digital urine-dipstick kidney screening.",
          "type": "Recognition",
          "hl": false,
          "src": "University of Waterloo News",
          "url": "https://uwaterloo.ca/news/10-waterloo-entrepreneurs-watch"
        },
        {
          "when": "Mar 2026",
          "text": "Won the $30,000 grand prize at SE Health’s Chrysalis Innovation Challenge for its at-home testing and digital monitoring approach to early chronic-disease detection.",
          "type": "Award",
          "hl": true,
          "src": "SE Health",
          "url": "https://sehc.com/news/newgen-health-wins-grand-prize-se-healths-chrysalis-innovation-challenge"
        }
      ],
      "project": "Feasibility and Pilot Deployment of the NewGen Smart-Cup"
    },
    {
      "name": "CELLECT Laboratories Inc.",
      "track": "Both",
      "rounds": "VC R7, R10, R17 · VL R3",
      "founder": "CT Murphy",
      "inst": "University of Waterloo",
      "linkedin": {
        "label": "company/cellectlaboratories",
        "url": "https://www.linkedin.com/company/cellectlaboratories/"
      },
      "website": {
        "label": "cellectlaboratories.com",
        "url": "https://cellectlaboratories.com"
      },
      "status": "live",
      "statusText": "LinkedIn + website active",
      "posts": [
        {
          "when": "Sep 2026",
          "text": "Awarded a third EQUIP VentureConnect grant (Round 17), alongside its VentureLift Round 3 grant.",
          "type": "Milestone",
          "hl": true,
          "src": "EQUIP Notice of Award",
          "url": null
        },
        {
          "when": "Nov 2026",
          "text": "Selected as one of five finalists pitching for $30,000 in prizes at McMaster's Startup Survivor 2026 pitch competition on November 18, 2026.",
          "type": "Recognition",
          "hl": false,
          "src": "The Forge (McMaster)",
          "url": "https://theforge.mcmaster.ca/pitchcompetition/"
        },
        {
          "when": "Aug 2026",
          "text": "Completed a project with Conestoga College's SMART Centre that produced a final prototype of its menstrual-blood cell-collection device suitable for limited testing.",
          "type": "Partnership",
          "hl": false,
          "src": "Conestoga Applied Research",
          "url": "https://ar.conestogac.on.ca/impact/developing-a-non-invasive-cervical-cancer-screening-technology-for-cellect-laboratories"
        },
        {
          "when": "Dec 2025",
          "text": "Co-founder Ibukun Elebute told Broadview Magazine the company has secured partnerships to prove its prototype ahead of cervical-cancer applications.",
          "type": "Milestone",
          "hl": false,
          "src": "Broadview Magazine",
          "url": "https://broadview.org/ibukun-elebute-cancer-screening/"
        },
        {
          "when": "Sep 2025",
          "text": "BioWorld reported CELLECT filed its first patent for its menstrual-product-based cervical cell collection method.",
          "type": "Milestone",
          "hl": true,
          "src": "BioWorld",
          "url": "https://www.bioworld.com/articles/724230-cellect-develops-menstrual-products-for-cervical-cancer-screening?v=p"
        },
        {
          "when": "2025",
          "text": "CBC-covered “game-changer” for women's health — won pitch funding for nanotech HPV / cervical-cancer screening built into menstrual products.",
          "type": "Recognition",
          "hl": true,
          "src": "CBC News",
          "url": "https://www.cbc.ca/news/canada/kitchener-waterloo/waterloo-startup-wins-money-for-invention-that-is-a-game-changer-for-women-s-health-1.7528762"
        }
      ],
      "project": "Pad-to-PCR V1.0: Integration, RUO Validation, and LDT Pilot Pack"
    },
    {
      "name": "Laetech",
      "track": "VC",
      "rounds": "VC R11",
      "founder": "Brian Webb · Kate MacQuarrie",
      "inst": "University of Toronto",
      "linkedin": {
        "label": "company/laetech",
        "url": "https://ca.linkedin.com/company/laetech"
      },
      "website": {
        "label": "laetechcorp.com",
        "url": "https://laetechcorp.com"
      },
      "status": "live",
      "statusText": "LinkedIn + website active",
      "posts": [
        {
          "when": "May 2026",
          "text": "Secured Mitacs funding to continue development and translation of its soft-tissue regeneration technology (amount undisclosed).",
          "type": "Funding",
          "hl": true,
          "src": "Santerre Lab, U of T",
          "url": "https://www.santerrelab.com/news/2026/5/8/laetech-rbpc"
        },
        {
          "when": "May 2026",
          "text": "Reached semi-finalist status as one of 42 startups at the 2026 Rice Business Plan Competition in Houston, with Brian Webb pitching.",
          "type": "Award",
          "hl": true,
          "src": "Rice Business Plan Competition",
          "url": "https://rbpc.rice.edu/2026/2026-startups"
        },
        {
          "when": "~7 mo ago",
          "text": "Presentation at TERMIS (Tissue Engineering & Regenerative Medicine International Society).",
          "type": "Conference",
          "hl": false,
          "src": "LinkedIn",
          "url": "https://www.linkedin.com/company/laetech/posts/"
        }
      ]
    },
    {
      "name": "Heprion Inc.",
      "track": "VC",
      "rounds": "VC R11, R12",
      "founder": "Hamza Arshad · Wenda Zhao",
      "inst": "University of Toronto",
      "linkedin": null,
      "website": {
        "label": "heprion.com",
        "url": "https://heprion.com"
      },
      "status": "web",
      "statusText": "Website only — no LinkedIn page found",
      "posts": [
        {
          "when": "Dec 2025",
          "text": "A U of T Tanz Centre profile confirmed Heprion spun out of Gerold Schmitt-Ulms’ lab with Hamza Arshad as CSO, in early-stage commercialization through U of T incubators while seeking funding.",
          "type": "Milestone",
          "hl": false,
          "src": "U of T Tanz Centre",
          "url": "https://tanz.med.utoronto.ca/news/tanz-centre-alum-finds-career-commercialization"
        },
        {
          "when": "n/a",
          "text": "U of T prion-disease biotech, early stage. No LinkedIn company page found.",
          "type": "Web only",
          "hl": false,
          "src": "heprion.com",
          "url": "https://heprion.com"
        }
      ]
    },
    {
      "name": "BioPSci Therapeutics",
      "track": "VC",
      "rounds": "VC R13",
      "founder": "Khalsa S.",
      "inst": "University of Toronto",
      "linkedin": null,
      "website": null,
      "status": "none",
      "statusText": "Nothing found",
      "posts": [
        {
          "when": "n/a",
          "text": "No LinkedIn page or website located — nothing to report.",
          "type": "None found",
          "hl": false,
          "src": "—",
          "url": null
        }
      ]
    },
    {
      "name": "Belaris Biotech",
      "track": "VC",
      "rounds": "VC R13",
      "founder": "Meghan Brar",
      "inst": "University of Waterloo",
      "linkedin": {
        "label": "company/belaris-biotech",
        "url": "https://ca.linkedin.com/company/belaris-biotech"
      },
      "website": {
        "label": "vetvivo.com",
        "url": "https://vetvivo.com"
      },
      "status": "live",
      "statusText": "LinkedIn active — website minimal",
      "posts": [
        {
          "when": "Jun 2026",
          "text": "Selected for the Innovation Boost Zone Innovation Fellowship (Stream 3, Product Development) from 136 Ontario applicants, receiving $10,000 for a four-month R&D push.",
          "type": "Funding",
          "hl": true,
          "src": "Innovation Boost Zone",
          "url": "https://ca.linkedin.com/company/innovationboostzone"
        },
        {
          "when": "Jun 2026",
          "text": "Presented clinical study results at the ACVIM Forum in Seattle, and pitched at Venture Summit West in Silicon Valley.",
          "type": "Clinical",
          "hl": false,
          "src": "LinkedIn",
          "url": "https://ca.linkedin.com/company/belaris-biotech"
        },
        {
          "when": "Apr 2026",
          "text": "A custom Belaris stent was placed in a canine patient in live surgery, restoring nasal breathing; the team was also a national finalist in The Arena 2026.",
          "type": "Clinical",
          "hl": true,
          "src": "LinkedIn / SMU News",
          "url": "https://news.smu.ca/news/2026/4/1/final-round-of-the-arena-2026-features-top-student-innovators-from-across-canada"
        }
      ]
    },
    {
      "name": "ThermOcular AI",
      "track": "VL",
      "rounds": "VL R1",
      "founder": "Ehsan Zare Bidaki",
      "inst": "University of Waterloo",
      "linkedin": null,
      "website": {
        "label": "thermocularai.ca",
        "url": "https://thermocularai.ca"
      },
      "status": "web",
      "statusText": "Website only — founder posts on personal profile",
      "posts": [
        {
          "when": "Oct 2026",
          "text": "A prospective study on post-eye-opening ocular surface cooling rate as a screening measure of tear film instability was accepted for publication in Eye & Contact Lens.",
          "type": "Clinical",
          "hl": false,
          "src": "Company website",
          "url": "https://www.thermocularai.ca/validation"
        },
        {
          "when": "Oct 2026",
          "text": "Completed its initial repeatability study, with a follow-on phase planned to test cooling-rate reproducibility across devices, operators and days.",
          "type": "Clinical",
          "hl": false,
          "src": "Company website",
          "url": "https://www.thermocularai.ca/company"
        },
        {
          "when": "Aug 2026",
          "text": "Published a peer-reviewed feasibility study of the ThermOcular dual thermal-visible imaging system in 25 healthy eyes in Contact Lens and Anterior Eye.",
          "type": "Milestone",
          "hl": false,
          "src": "PubMed",
          "url": "https://pubmed.ncbi.nlm.nih.gov/42632197/"
        },
        {
          "when": "Aug 2026",
          "text": "Reported receiving 14 letters of intent from eye-care clinics.",
          "type": "Milestone",
          "hl": true,
          "src": "Company website",
          "url": "https://www.thermocularai.ca/company"
        },
        {
          "when": "Mar 2026",
          "text": "Presented oral and poster research at the Netherlands Contact Lens Congress (NCC 2026) in the BCLA scientific stream.",
          "type": "Conference",
          "hl": false,
          "src": "Company website",
          "url": "https://www.thermocularai.ca/validation"
        },
        {
          "when": "Nov 2026",
          "text": "Company website lists 120 participants across its feasibility, dry-eye and repeatability studies and patent applications pending in the US and Canada, with broader clinical rollout awaiting regulatory clearance.",
          "type": "Update",
          "hl": false,
          "src": "Company website",
          "url": "https://www.thermocularai.ca/validation"
        }
      ],
      "project": "Advancing Commercialization of ThermOcular: An AI-Powered Diagnostic Platform for Dry Eye Screening"
    },
    {
      "name": "Synakis",
      "track": "VL",
      "rounds": "VL R1",
      "founder": "Jonathan Labriola",
      "inst": "University of Toronto",
      "linkedin": {
        "label": "company/synakis",
        "url": "https://ca.linkedin.com/company/synakis"
      },
      "website": {
        "label": "synakis.ca",
        "url": "https://www.synakis.ca"
      },
      "status": "live",
      "statusText": "LinkedIn + website active",
      "posts": [
        {
          "when": "Oct 2026",
          "text": "Appointed former Allergan Japan president Schalon Newton, DBA, as an independent member of its Board of Directors.",
          "type": "Update",
          "hl": false,
          "src": "Synakis news",
          "url": "https://www.synakis.ca/news-schalon"
        },
        {
          "when": "May 2025",
          "text": "Won first place and a $25,000 prize at the ARVO 2025 Eye Pitch competition, held with the Alcon Seed Fund in Salt Lake City.",
          "type": "Award",
          "hl": false,
          "src": "Synakis news",
          "url": "https://www.synakis.ca/news-arvo"
        },
        {
          "when": "Jun 2026",
          "text": "Won both the Judge’s Choice and People’s Choice Awards in the Capital & Growth category at the 2026 Ophthalmology Tech Forum in Newport Beach.",
          "type": "Award",
          "hl": true,
          "src": "Synakis news",
          "url": "https://www.synakis.ca/news-otf"
        },
        {
          "when": "May 2026",
          "text": "Closed an oversubscribed CAD $2.6M pre-seed round co-led by Toronto Innovation Acceleration Partners (TIAP) and Chiefswood Private Capital, with the Ontario Centre of Innovation and GlycoNet participating — funding GLP toxicology and a Health Canada Investigational Testing Authorization filing for SNK-125.",
          "type": "Funding",
          "hl": true,
          "src": "Cision Newswire",
          "url": "https://www.newswire.ca/news-releases/synakis-announces-close-of-oversubscribed-pre-seed-round-826502148.html"
        },
        {
          "when": "Mar 2026",
          "text": "Admitted to Ontario Genomics’ BioCreate program, securing $150,000 in seed funding plus 18 months of mentorship and infrastructure.",
          "type": "Funding",
          "hl": true,
          "src": "Synakis news",
          "url": "https://www.synakis.ca/news-biocreate"
        },
        {
          "when": "Dec 2025",
          "text": "Co-founder and CSO Molly Shoichet received the Terrence Donnelly Innovation Award ($250,000) to advance the ocular hydrogel technology behind Synakis.",
          "type": "Award",
          "hl": true,
          "src": "Synakis news",
          "url": "https://www.synakis.ca/news-donnelly"
        },
        {
          "when": "2024",
          "text": "Won 1st place at the Desjardins Pitch Competition (Donnelly Centre startup).",
          "type": "Award",
          "hl": true,
          "src": "Donnelly Centre",
          "url": "https://thedonnellycentre.utoronto.ca/news/donnelly-centre-startup-wins-first-place-desjardins-pitch-competition"
        }
      ],
      "project": "Manufacturing processes and design controls for SNK-125"
    },
    {
      "name": "Vrit Inc.",
      "track": "Both",
      "rounds": "VC R14 · VL R2",
      "founder": "Sushant Singh",
      "inst": "University of Toronto",
      "linkedin": {
        "label": "company/vrit-inc",
        "url": "https://ca.linkedin.com/company/vrit-inc"
      },
      "website": {
        "label": "vrit.co",
        "url": "https://www.vrit.co"
      },
      "status": "live",
      "statusText": "LinkedIn + website active",
      "posts": [
        {
          "when": "Sep 2026",
          "text": "Featured in the University of Toronto Rocket Pitches showcase at Elevate Festival 2026, with CEO Sushant Singh listed as a speaker.",
          "type": "Conference",
          "hl": false,
          "src": "U of T Entrepreneurship",
          "url": "https://entrepreneurs.utoronto.ca/event/elevate-festival-2026/"
        },
        {
          "when": "Apr 2026",
          "text": "Selected for York University YSpace's 2026 Technology Accelerator cohort to develop its INSITE handheld bioprinting platform.",
          "type": "Recognition",
          "hl": false,
          "src": "YSpace (York University)",
          "url": "https://www.yorku.ca/yspace/news-story/meet-the-2026-tech-accelerator-cohort/"
        },
        {
          "when": "Mar 2026",
          "text": "Founder and CEO Sushant Singh won the $40,000 top overall prize at U of T's 2026 Desjardins Startup Prize, after placing third in the early-stage category in 2025.",
          "type": "Award",
          "hl": true,
          "src": "U of T Engineering",
          "url": "https://news.engineering.utoronto.ca/the-future-of-wound-healing-desjardins-prize-supports-u-of-t-bioprinting-startup/"
        },
        {
          "when": "Mar 2026",
          "text": "Demonstrated the INSITE handheld bioprinter to Ontario Minister of Colleges and Universities Nolan Quinn during a visit to U of T.",
          "type": "Update",
          "hl": false,
          "src": "U of T MIE",
          "url": "https://www.mie.utoronto.ca/robotics-life-sciences-research-on-display-for-minister-nolan-quinn/"
        },
        {
          "when": "Jul 2026",
          "text": "U of T Engineering reported VRiT is preparing to launch a $3M pre-seed financing round, using Desjardins prize money to develop its regulatory strategy.",
          "type": "Milestone",
          "hl": true,
          "src": "U of T Engineering",
          "url": "https://news.engineering.utoronto.ca/the-future-of-wound-healing-desjardins-prize-supports-u-of-t-bioprinting-startup/"
        },
        {
          "when": "May 2026",
          "text": "Named to the BetaKit Most Ambitious 2026 list under the “Defend the Dominion” theme for its hand-held bioprinter.",
          "type": "Recognition",
          "hl": false,
          "src": "BetaKit",
          "url": "https://mostambitious.betakit.com/2026/vrit/"
        }
      ],
      "project": "INSITE Bioprinter for Enhanced Autograft Fixation for Severe Skin Wound Reconstruction"
    },
    {
      "name": "Fertilead Inc.",
      "track": "VL",
      "rounds": "VL R2",
      "founder": "Narjes Allahrabbi",
      "inst": "Toronto Metropolitan University",
      "linkedin": {
        "label": "company/fertileadinc",
        "url": "https://ca.linkedin.com/company/fertileadinc"
      },
      "website": {
        "label": "fertilead.com",
        "url": "https://www.fertilead.com"
      },
      "status": "live",
      "statusText": "Website (pre-launch) and LinkedIn active",
      "posts": [
        {
          "when": "Oct 2026",
          "text": "Fertilead's VentureLift grant was cited at the October 2026 iBEST Symposium as an outcome of the iBEST-BioHubNet partnership.",
          "type": "Update",
          "hl": false,
          "src": "iBEST",
          "url": "https://ibestresearch.ca/event-recap-2026-ibest-symposium-explores-ais-growing-role-in-biomedical-research-and-health-care/"
        },
        {
          "when": "Mar 2026",
          "text": "Mitacs reported Fertilead was in the final stages of Research Ethics Board approval for FertiliTab, its clinical sperm-preparation device, with a pre-clinical validation study planned at CReATe Fertility Clinic in Toronto.",
          "type": "Clinical",
          "hl": false,
          "src": "Mitacs",
          "url": "https://www.mitacs.ca/our-innovation-insights/how-is-a-toronto-researcher-re-thinking-male-infertility-treatment/"
        },
        {
          "when": "Feb 2026",
          "text": "TMU reported Fertilead's 2026 goal is Research Ethics Board approval and a first Canadian clinical validation study with 30 patients.",
          "type": "Clinical",
          "hl": false,
          "src": "Toronto Metropolitan University",
          "url": "https://www.torontomu.ca/engineering-architectural-science/stories-events/stories/2026/02/dr-narjes-allahrabbi-wins-2025-mitacs-innovation-award/"
        },
        {
          "when": "Jan 2026",
          "text": "Named one of the finalists for the 2026 Synapse Life Science Pitch Competition run by Innovation Factory.",
          "type": "Recognition",
          "hl": false,
          "src": "Innovation Factory",
          "url": "https://innovationfactory.ca/innovation-factory-announces-finalists-for-2026-synapse-life-science-pitch-competition/"
        },
        {
          "when": "Nov 2025",
          "text": "Founder and CEO Narjes Allahrabbi received the 2025 Mitacs Innovation Award for Canadian Start-Up Innovator of the Year in Ottawa.",
          "type": "Award",
          "hl": true,
          "src": "GTA Weekly",
          "url": "https://www.gtaweekly.ca/mitacs-innovation-award-toronto-scientist/"
        },
        {
          "when": "~10 mo ago",
          "text": "Announced being awarded the EQUIP VentureLift Grant.",
          "type": "Award",
          "hl": true,
          "src": "LinkedIn post",
          "url": "https://www.linkedin.com/company/fertileadinc/posts/"
        }
      ],
      "project": "Development and Validation Study for an Autonomous Sperm Preparation Device"
    },
    {
      "name": "Sparked Inc.",
      "track": "Both",
      "rounds": "VC R15 · VL R2",
      "founder": "Stephanie Buryk-Iggers",
      "inst": "University of Toronto / UHN",
      "linkedin": {
        "label": "company/sparkedscreening",
        "url": "https://ca.linkedin.com/company/sparkedscreening"
      },
      "website": {
        "label": "sparkedscreening.com",
        "url": "https://sparkedscreening.com"
      },
      "status": "web",
      "statusText": "LinkedIn page exists but no posts published",
      "posts": [
        {
          "when": "Oct 2025",
          "text": "Founder Stephanie Buryk-Iggers was one of seven finalists at the Lab2Market Summit Pitch Competition in Montreal, after Sparked took part in Lab2Market Launch Ontario 2025.",
          "type": "Recognition",
          "hl": false,
          "src": "Lab2Market",
          "url": "https://www.lab2market.ca/news/seven-alumni-turning-research-into-solutions-canada-needs-now"
        },
        {
          "when": "Nov 2024",
          "text": "Won one of three $5,000 Student Innovation Fellowships at the Temerty Faculty of Medicine Pitch Perfect 2024 competition.",
          "type": "Award",
          "hl": false,
          "src": "H2i, U of T",
          "url": "https://h2i.utoronto.ca/2024/11/14/pitch-perfect-2024-recap-winners-announcement/"
        },
        {
          "when": "Jun 2026",
          "text": "Awarded an EQUIP VentureConnect grant (Round 15), adding a second EQUIP award alongside its VentureLift Round 2 grant.",
          "type": "Milestone",
          "hl": true,
          "src": "EQUIP Notice of Award",
          "url": null
        },
        {
          "when": "Dec 2025",
          "text": "Selected into UTM’s SpinUp wet-lab incubator for its at-home saliva-based cardiovascular screening device; founder Stephanie Buryk-Iggers completed her PhD and is now a postdoctoral researcher at Toronto General Hospital.",
          "type": "Milestone",
          "hl": true,
          "src": "U of T KPE / SpinUp",
          "url": "https://kpe.utoronto.ca/student-profile/rugby-rehabilitation-stephanie-buryk-iggers-lights-spark"
        },
        {
          "when": "2022",
          "text": "First at-home saliva CVD-risk screening; won the grand prize at H2i's FemSTEM pitch and reached four pitch finals.",
          "type": "Milestone",
          "hl": true,
          "src": "U of T news",
          "url": "https://www.utoronto.ca/news/having-lost-her-dad-stroke-phd-student-launches-cardiovascular-screening-startup"
        }
      ],
      "project": "Smart Saliva for Heart Health"
    },
    {
      "name": "Oculum",
      "track": "VL",
      "rounds": "VL R2",
      "founder": "Olga Klushina",
      "inst": "University of Toronto / York",
      "linkedin": {
        "label": "company/oculummedical",
        "url": "https://ca.linkedin.com/company/oculummedical"
      },
      "website": null,
      "status": "web",
      "statusText": "LinkedIn active — no public website",
      "posts": [
        {
          "when": "Apr 2026",
          "text": "Founder Olga Klushina was named to York University's 2026 Top 30 Alumni Under 30 list as founder of Oculum.",
          "type": "Recognition",
          "hl": false,
          "src": "York University Alumni",
          "url": "https://www.yorku.ca/alumniandfriends/top30/"
        },
        {
          "when": "Apr 2025",
          "text": "Oculum was one of three H2i ventures awarded a $25,000 Tech@RBC Momentum Grant for its real-time tissue visualization tool for eye surgeons.",
          "type": "Funding",
          "hl": false,
          "src": "H2i, U of T",
          "url": "https://h2i.utoronto.ca/2025/04/04/h2i-ventures-in-the-news-oculum-vrit-repair-genomics-bobo-app-toothpod-cellet-laboratories-xatoms/"
        },
        {
          "when": "Apr 2026",
          "text": "Founder Olga Klushina selected as an Innovation Fellow in Sunnybrook’s Medventions program; Oculum is developing a surgical guidance tool for ophthalmic surgery with Sunnybrook Hospital.",
          "type": "Partnership",
          "hl": true,
          "src": "York University Alumni",
          "url": "https://www.yorku.ca/alumniandfriends/2026/04/olga-klushina-beng-21/"
        }
      ],
      "project": "Intraoperative Visualization for Eye Tissues"
    },
    {
      "name": "Mandel Diagnostics",
      "track": "VL",
      "rounds": "VL R3",
      "founder": "Connor Kapahi",
      "inst": "Kitchener / Velocity",
      "linkedin": null,
      "website": {
        "label": "mandeldx.com",
        "url": "https://mandeldx.com"
      },
      "status": "live",
      "statusText": "Website active (mandeldx.com), POLI AMD screening device",
      "posts": [
        {
          "when": "Nov 2026",
          "text": "Mandel Diagnostics used its Enactus prize to commit two of its eye-screening devices to medical missions, where optometrists will use them in underserved communities abroad and in remote Canada.",
          "type": "Milestone",
          "hl": false,
          "src": "BetaKit (sponsored by Enactus Canada)",
          "url": "https://betakit.com/could-you-be-canadas-next-top-student-entrepreneur/"
        },
        {
          "when": "Jan 2026",
          "text": "Named one of the finalists for the 2026 Synapse Life Science Pitch Competition run by Innovation Factory.",
          "type": "Recognition",
          "hl": false,
          "src": "Innovation Factory",
          "url": "https://innovationfactory.ca/innovation-factory-announces-finalists-for-2026-synapse-life-science-pitch-competition/"
        },
        {
          "when": "May 2026",
          "text": "Connor Kapahi named top Student Entrepreneur at the 2026 Enactus Canada Student Entrepreneur National Competition, earning $10,000 for Mandel Diagnostics.",
          "type": "Award",
          "hl": true,
          "src": "Enactus Canada",
          "url": "https://enactus.ca/media-releases/connor-kapahi-wins-2026-student-entrepreneur-national-competition-for-mandel-diagnostics/"
        },
        {
          "when": "Feb 2026",
          "text": "Won the T-CAIREM Shark Tank Pitch Competition at the University of Toronto, taking a $25,000 prize for its AMD screening device.",
          "type": "Award",
          "hl": true,
          "src": "T-CAIREM, U of T",
          "url": "https://tcairem.utoronto.ca/news/meet-winner-t-cairem-shark-tank-pitch-competition-connor-kapahi"
        },
        {
          "when": "Nov 2025",
          "text": "One of five Waterloo startups awarded a $10,000 Velocity Momentum Grant to bring its MVP to market.",
          "type": "Funding",
          "hl": false,
          "src": "Velocity, U Waterloo",
          "url": "https://www.velocityincubator.com/news/velocity-is-building-momentum-for-waterloo-startups"
        }
      ],
      "project": "Clinical Validation and Commercial Development of Rapid Retinal Diagnostic Technology"
    },
    {
      "name": "Zearup Biomed Inc.",
      "track": "VL",
      "rounds": "VL R4",
      "founder": "Jackie Liu",
      "inst": "University of Toronto",
      "linkedin": {
        "label": "company/zearup-biomed",
        "url": "https://www.linkedin.com/company/zearup-biomed/"
      },
      "website": null,
      "status": "web",
      "statusText": "LinkedIn company page (listed by H2i); no website",
      "posts": [
        {
          "when": "Jul 2025",
          "text": "Co-founder Jackie Fule Liu was profiled as a U of T Pharmacy 'Grad to Watch'; Zearup reached the final pitch stage of PRiME's Building a Biotech Venture and joined the MaRS x JLABS Rapid Fire Showcase.",
          "type": "Recognition",
          "hl": false,
          "src": "U of T Leslie Dan Faculty of Pharmacy",
          "url": "https://www.pharmacy.utoronto.ca/news-announcements/grad-watch-jackie-fule-lius-research-focuses-better-outcomes-diabetes-patients"
        }
      ],
      "project": "Commercialization Validation for a Glucose-Responsive Microneedle Patch"
    },
    {
      "name": "ChASE Biotherapeutics",
      "track": "Both",
      "rounds": "VC R19 · VL R4",
      "founder": "Quinton Sirianni",
      "inst": "University of Toronto",
      "linkedin": null,
      "website": {
        "label": "chasebio.ca",
        "url": "https://chasebio.ca"
      },
      "status": "web",
      "statusText": "Website live (chasebio.ca); no LinkedIn company page found",
      "posts": [
        {
          "when": "Nov 2026",
          "text": "Awarded an EQUIP VentureConnect grant (Round 19), adding a second EQUIP award alongside its VentureLift Round 4 grant.",
          "type": "Milestone",
          "hl": true,
          "src": "EQUIP Notice of Award",
          "url": null
        },
        {
          "when": "Sep 2026",
          "text": "Team members published preclinical results in Advanced Science showing that sustained-release ChASE37 delivered with human iPSC-derived neural progenitors improved transplant survival and functional recovery in a rat stroke model.",
          "type": "Milestone",
          "hl": false,
          "src": "Advanced Science",
          "url": "https://doi.org/10.1002/advs.202522499"
        },
        {
          "when": "May 2025",
          "text": "Selected by PRiME to pitch at the MaRS x JLABS Emerging Venture Rapid Fire Showcase, and named a finalist in PRiME's Building a Biotech Venture pitch competition.",
          "type": "Recognition",
          "hl": false,
          "src": "Chase Biotherapeutics website",
          "url": "https://chasebio.ca/"
        },
        {
          "when": "Jul 2025",
          "text": "Co-founder Molly Shoichet received a $948,600 CIHR Project Grant to advance the ChASE37-AR platform for spinal cord and brain injury, funding preclinical studies and spin-off business development.",
          "type": "Funding",
          "hl": true,
          "src": "U of T Institute of Biomedical Engineering",
          "url": "https://bme.utoronto.ca/news/four-bme-core-faculty-members-receive-cihr-project-grant-funding/"
        }
      ],
      "project": "Development of Scaled-Up Manufacturing of GMP-Aligned ChASE37 and Dexime"
    },
    {
      "name": "Farname-Diagnosis",
      "track": "VL",
      "rounds": "VL R4",
      "founder": "Soha Ahmadi",
      "inst": "University of Toronto",
      "linkedin": null,
      "website": {
        "label": "sites.google.com/view/farname-diagnosis",
        "url": "https://sites.google.com/view/farname-diagnosis"
      },
      "status": "web",
      "statusText": "Google Sites website (team + news); no LinkedIn company page",
      "posts": [
        {
          "when": "Mar 2026",
          "text": "Placed third in the Early-Stage category of the 2026 Desjardins Startup Prize Pitch Competition at the University of Toronto.",
          "type": "Award",
          "hl": true,
          "src": "U of T Entrepreneurship",
          "url": "https://entrepreneurs.utoronto.ca/meet-the-winners-2026-desjardins-startup-prize-pitch/"
        },
        {
          "when": "2025",
          "text": "Founder Soha Ahmadi won the SICIEEIL pitch competition.",
          "type": "Award",
          "hl": true,
          "src": "U of T Chemistry",
          "url": "https://www.chemistry.utoronto.ca/news/synergy-science-dr-soha-ahmadi"
        }
      ],
      "project": "Point-of-Care Testing Device for Ovarian Cancer Screening"
    },
    {
      "name": "AlloWide Health Inc",
      "track": "VC",
      "rounds": "VC R14",
      "founder": "Poorya Saeedloo",
      "inst": "University of Toronto",
      "linkedin": {
        "label": "company/allowide-health-inc",
        "url": "https://www.linkedin.com/company/allowide-health-inc/"
      },
      "website": {
        "label": "allowidehealth.com",
        "url": "https://allowidehealth.com"
      },
      "status": "live",
      "statusText": "LinkedIn + website active",
      "posts": [
        {
          "when": "May 2026",
          "text": "Awarded an EQUIP VentureConnect grant (Round 14). Developing a patent-protected rehydration buffer for freeze-dried bone allografts; in pre-clinical validation with one provisional patent and one PCT application filed.",
          "type": "Milestone",
          "hl": true,
          "src": "EQUIP Notice of Award",
          "url": null
        }
      ]
    },
    {
      "name": "Alpha Biosensing",
      "track": "VL",
      "rounds": "VL R5",
      "founder": "Nicholas Kotoulas",
      "inst": "University of Toronto",
      "linkedin": null,
      "website": {
        "label": "alphabiosensing.com",
        "url": "https://www.alphabiosensing.com"
      },
      "status": "web",
      "statusText": "Website active — no LinkedIn company page found",
      "posts": [
        {
          "when": "Jul 2026",
          "text": "Awarded an EQUIP VentureLift grant (Round 5). Co-founded by CEO Nicholas Kotoulas and CSO Prof. M. Cynthia Goh (U of T Chemistry), building low-cost rapid bacterial biosensors: a “Surface Interaction Profile” that fingerprints the whole bacterial surface to identify pathogens, and a diffraction-based optical sensor that detects bacterial growth in under 20 minutes for rapid antibiotic-susceptibility testing.",
          "type": "Milestone",
          "hl": true,
          "src": "EQUIP Notice of Award",
          "url": null
        },
        {
          "when": "Jun 2025",
          "text": "Published the core pathogen-ID method in PLOS ONE — “Differentiating bacteria by their unique surface interactions” — with the Surface Interaction Profile distinguishing 12 test bacteria including MRSA, K. pneumoniae, A. baumannii and P. aeruginosa from a 10-minute interaction.",
          "type": "Milestone",
          "hl": true,
          "src": "PLOS ONE",
          "url": "https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0327489"
        },
        {
          "when": "Jul 2024",
          "text": "U of T Chemistry reported the Goh Lab launching BactiTrack, a low-cost diffraction-based device for detecting bacterial growth and antibiotic susceptibility built from a Raspberry Pi, Pi Camera and 3D-printed parts; a prototype was sent to Philippine General Hospital for testing.",
          "type": "Product",
          "hl": false,
          "src": "U of T Department of Chemistry",
          "url": "https://www.chemistry.utoronto.ca/news/goh-lab-launches-bactitrack-project"
        },
        {
          "when": "2024",
          "text": "Published the antibiotic-susceptibility technology in Analytical Methods — “Low-cost, real-time detection of bacterial growth via diffraction-based sensing.”",
          "type": "Milestone",
          "hl": false,
          "src": "Analytical Methods (RSC)",
          "url": "https://doi.org/10.1039/D4AY01489H"
        }
      ],
      "project": "Prototype and commercialization readiness for rapid bacterial sensing platform"
    },
    {
      "name": "NorthMiRs Inc.",
      "track": "VL",
      "rounds": "VL R5",
      "founder": "Samantha McWhirter",
      "inst": "University of Toronto",
      "linkedin": {
        "label": "company/northmirs",
        "url": "https://ca.linkedin.com/company/northmirs"
      },
      "website": {
        "label": "northmirs.com",
        "url": "https://www.northmirs.com"
      },
      "status": "live",
      "statusText": "LinkedIn + website active",
      "posts": [
        {
          "when": "Jul 2026",
          "text": "University of Vermont biosafety committee minutes recorded a new registration for mouse studies of miRNA lipid nanoparticles against acute lung injury at BioLabs Colchester under NorthMiRs US Inc., founded by clinical advisor Dr. Daniel Weiss and funded by a Vermont Department of Labor grant; the committee required modifications before approval.",
          "type": "Update",
          "hl": false,
          "src": "University of Vermont IBC minutes",
          "url": "https://www.uvm.edu/d10-files/documents/2026-11/Minutes-for-July-14-2026-IBC-Meeting_Signed.pdf"
        },
        {
          "when": "Jul 2026",
          "text": "Awarded an EQUIP VentureLift grant (Round 5). Developing synthetic microRNA therapeutics delivered by lipid nanoparticles for sepsis-induced organ failure; lead candidate NM-001 targets sepsis-induced cardiac dysfunction. Spun out of the Walker Lab (U of T Chemistry) and the dos Santos lab (Temerty Medicine / St. Michael’s Hospital).",
          "type": "Milestone",
          "hl": true,
          "src": "EQUIP Notice of Award",
          "url": null
        },
        {
          "when": "Sep 2025",
          "text": "Co-founder and CEO Samantha McWhirter completed her PhD at the University of Toronto (Walker Lab), on formulating lipid nanoparticles to deliver microRNAs against dysregulated immune responses.",
          "type": "Milestone",
          "hl": false,
          "src": "The Walker Lab, U of T",
          "url": "https://www.thewalkerlab.com/2025/09/26/congratulations-to-dr-samantha-mcwhirter/"
        },
        {
          "when": "Apr 2025",
          "text": "MaRS Discovery District profiled the company’s academia-to-startup jump: incorporated in 2022, into the MaRS/adMare Therapeutics Accelerator in 2023, running preclinical work while pursuing pre-seed funding.",
          "type": "Recognition",
          "hl": false,
          "src": "MaRS Discovery District",
          "url": "https://www.marsdd.com/research-and-insights/how-northmirs-made-the-jump-from-academia-to-entrepreneurship/"
        },
        {
          "when": "Oct 2024",
          "text": "Won $250,000 at the ECHO PITCH competition run by the Ted Rogers Centre for Heart Research to develop a heart-failure treatment for sepsis patients.",
          "type": "Funding",
          "hl": true,
          "src": "U of T Faculty of Arts & Science",
          "url": "https://www.artsci.utoronto.ca/news/chemistry-startup-northmirs-wins-250k-develop-heart-failure-treatment-sepsis-patients"
        },
        {
          "when": "Oct 2023",
          "text": "Named one of two inaugural Ontario ventures (with Quthero Canada) in the adMare BioInnovations / MaRS Discovery District Therapeutics Accelerator Program.",
          "type": "Recognition",
          "hl": false,
          "src": "adMare BioInnovations",
          "url": "https://www.admarebio.com/en/news-details/admare-bioinnovations-and-mars-discovery-district-welcome-inaugural-ontario-start-ups-to-therapeutics-accelerator-program"
        }
      ],
      "project": "NorthMiRs Pilot Porcine Study Extension"
    },
    {
      "name": "ArteraNova Therapeutics",
      "linkedin": {
        "label": "company/arteranova-therapeutics",
        "url": "https://ca.linkedin.com/company/arteranova-therapeutics"
      },
      "website": {
        "label": "arteranova.com",
        "url": "https://arteranova.com"
      },
      "status": "web",
      "statusText": "LinkedIn active — website arteranova.com returning an SSL error (Cloudflare 526) as of Nov 2026",
      "posts": [
        {
          "when": "Nov 2026",
          "text": "Awarded an EQUIP VentureLift grant (Round 6) to develop and scale up a peptide–nanoparticle-coated angioplasty balloon that prevents restenosis.",
          "type": "Milestone",
          "hl": true,
          "src": "EQUIP Notice of Award",
          "url": null
        },
        {
          "when": "Oct 2026",
          "text": "Won the Cardiovascular Health Stream of ECHO PITCH 2026, co-hosted by U of T Temerty Medicine's MedCP and TBEP at the Ted Rogers Centre for Heart Research, receiving $100,000 in non-dilutive funding for its peptide-nanoparticle therapy delivered by angioplasty balloon.",
          "type": "Funding",
          "hl": true,
          "src": "ArteraNova Therapeutics (LinkedIn)",
          "url": "https://www.linkedin.com/posts/arteranova-therapeutics_arteranova-cardiovascularhealth-medtech-activity-7524089657043922944-p_J4"
        },
        {
          "when": "Apr 2026",
          "text": "Pitched in the FemSTEM 2026 Pitch Competition at U of T's Women Driving Health Innovation event, presented by CEO Nazli Hassanpour, describing its NanoSmooth peptide-nanoparticle platform to limit smooth muscle cell migration while preserving vessel healing.",
          "type": "Conference",
          "hl": false,
          "src": "U of T Entrepreneurship",
          "url": "https://entrepreneurs.utoronto.ca/event/women-driving-health-innovation-celebrating-excellence-in-entrepreneurship/"
        }
      ],
      "track": "VL",
      "rounds": "VL R6",
      "founder": "Kaiwen Liu",
      "inst": "University of Toronto",
      "project": "Development and Scale-Up of a Peptide–Nanoparticle-Coated Angioplasty Balloon for the Prevention of Restenosis"
    },
    {
      "name": "mDETECT Inc.",
      "linkedin": {
        "label": "company/mdetect-inc",
        "url": "https://ca.linkedin.com/company/mdetect-inc"
      },
      "website": {
        "label": "mdetect-inc.com",
        "url": "https://www.mdetect-inc.com"
      },
      "status": "live",
      "statusText": "LinkedIn + website active",
      "posts": [
        {
          "when": "Oct 2026",
          "text": "Awarded an EQUIP VentureLift grant (Round 6) to use its blood test to monitor metastatic breast cancer treatment.",
          "type": "Milestone",
          "hl": true,
          "src": "EQUIP Notice of Award",
          "url": null
        },
        {
          "when": "Nov 2026",
          "text": "Announced plans to offer its tumor-naive, methylation-based liquid biopsy technology as a research assay for Thermo Fisher Scientific's Ion Torrent sequencing platforms, for ctDNA analysis in lung cancer research without tumor tissue.",
          "type": "Product",
          "hl": false,
          "src": "mDETECT",
          "url": "https://www.mdetect-inc.com/news"
        },
        {
          "when": "May 2026",
          "text": "Selected for funding of up to $500,000 from Ontario's Life Sciences Innovation Fund, delivered by the Ontario Centre of Innovation, to advance its DNA-methylation liquid biopsy technology.",
          "type": "Funding",
          "hl": true,
          "src": "Ontario Centre of Innovation",
          "url": "https://www.oc-innovation.ca/media-releases/life-sciences-innovation-fund-mobilizes-19-3-million-to-accelerate-made-in-ontario-health-innovation/"
        },
        {
          "when": "Apr 2026",
          "text": "Closed a $3.0 million seed financing round to commercialize its DNA methylation blood tests, expand clinical validation and support the launch of its lung cancer test.",
          "type": "Funding",
          "hl": true,
          "src": "mDETECT",
          "url": "https://www.mdetect-inc.com/news"
        },
        {
          "when": "Jun 2025",
          "text": "Won the $25,000 grand prize at the Startup World Cup Ottawa regional pitch competition at AccelerateOTT, pitched by Keira Frosst, earning a place at the Startup World Cup finals in San Francisco.",
          "type": "Award",
          "hl": false,
          "src": "Ottawa Business Journal",
          "url": "https://obj.ca/startups-take-centre-stage-at-accelerate-ott"
        },
        {
          "when": "Sep 2024",
          "text": "Co-founder Dr. Irsa Wiginton won the US$15,000 first-place prize at the LG Innofest meeting in San Francisco.",
          "type": "Award",
          "hl": false,
          "src": "mDETECT",
          "url": "https://www.mdetect-inc.com/news"
        },
        {
          "when": "Mar 2023",
          "text": "Received a $900,000 grant from the Canadian Institutes of Health Research to launch clinical trials in Kingston and Ottawa validating its breast cancer liquid biopsy in women with metastatic breast cancer.",
          "type": "Funding",
          "hl": true,
          "src": "Invest Kingston",
          "url": "https://www.investkingston.ca/mdetect-launches-breast-cancer-liquid-biopsy-clinical-trial/"
        }
      ],
      "track": "VL",
      "rounds": "VL R6",
      "founder": "Keira Frosst",
      "inst": "Queen's University",
      "project": "Using a blood test to monitor metastatic breast cancer treatment"
    }
  ];

/** The simplified public shape — company + recipient + track, and (VL only) a
 *  project name. Both the admin Recipients tab and the public JSON feed render
 *  this, so they never drift. */
export interface PublicRecipient {
  company: string;
  recipient: string;
  institution: string;
  track: EquipTrack;
  project?: string;
}

export function toPublicRecipients(): PublicRecipient[] {
  return EQUIP_RECIPIENTS.map((r) => ({
    company: r.name,
    recipient: r.founder,
    institution: r.inst,
    track: r.track,
    ...(r.project ? { project: r.project } : {}),
  }));
}
