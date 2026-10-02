/**
 * How biohubnet.ca/training-week-2026 presents each session — the words
 * the website shows that the registration form does not: the anchor its
 * "View details" link jumps to, the line under the name in the timetable,
 * and the full description card.
 *
 * Facts (day, times, seats, venue, bus, Open/Full/Closed) are NOT here:
 * they come from SESSIONS and the status switch, so the website, the
 * registration form and Training Admin can never disagree. This file is
 * only presentation — one "version" of the same sessions. Moved here from
 * the website on 2 Oct 2026, so the platform is the one place to edit it;
 * the website renders it from /api/public/training-week/workshops.
 *
 * The description HTML is ours (written here, not user input) and uses
 * the website's own classes (workshop-subtitle, entity-link,
 * facilitator-list, workshop-facilitator, profile-trigger).
 */
export interface WebContent {
  /** The id of the session's card on the page — "View details" links to #anchor. */
  anchor: string;
  /** The name on the website, when it differs from the session title. */
  title?: string;
  /** The line under the name in the timetable. */
  host: string | null;
  /** The description card, as HTML. */
  detailsHtml: string;
}

const link = (href: string, text: string) =>
  `<a class="entity-link" href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;

export const WEB_CONTENT: Record<string, WebContent> = {
  "catalent-tour-lunch-learn-2026": {
    anchor: "company-tour",
    host: "Microbix Biosystems",
    detailsHtml: [
      `<p class="workshop-subtitle">Microbix Biosystems</p>`,
      `<p>${link("https://microbix.com/", "Microbix Biosystems")} is a Canadian biotechnology company that develops and manufactures infectious disease diagnostic products, quality control materials, and biomanufacturing solutions used by healthcare and diagnostic organizations around the world.</p>`,
      `<p><strong>Location:</strong> Microbix Biosystems Inc.<br>${link("https://microbix.com/contact", "265 Watline Ave, Mississauga, ON")}</p>`,
      `<p><strong>Getting there:</strong> Transportation will be provided.</p>`,
    ].join("\n"),
  },
  "cl3-workshop-2026": {
    anchor: "pandemic-preparedness",
    host: "Toronto High Containment Facility (CL3)",
    detailsHtml: [
      `<p class="workshop-subtitle">Step Inside the World of High-Containment Pathogen Research</p>`,
      `<div class="facilitator-list" aria-label="Facilitators"><p><strong>Natasha Christie-Holmes, PhD</strong>Director, Strategy &amp; Partnerships, ${link("https://epic.utoronto.ca/", "EPIC")}</p><p><strong>Jessica Lam, MSc</strong>Manager, ${link("https://epic.utoronto.ca/high-containment-laboratory-c-cl3/", "Toronto High Containment Facility (THCF)")}</p></div>`,
      `<p>Get a behind-the-scenes look at how researchers study emerging and high-containment pathogens in academic settings, and how this work contributes to pandemic preparedness and response. Explore the regulatory landscape, discover how CL3 facilities are designed and operated, hear directly from researchers working in the field, and go behind the scenes with a guided tour of the ${link("https://epic.utoronto.ca/high-containment-laboratory-c-cl3/", "Toronto High Containment Facility (THCF)")}.</p>`,
      `<p>This immersive workshop will give trainees a practical, high-level understanding of the infrastructure, biosafety, and operational approaches that support research and preparedness for future infectious disease threats.</p>`,
    ].join("\n"),
  },
  "communication-chameleon-2026": {
    anchor: "communication-chameleon",
    host: null,
    detailsHtml: [
      `<p class="workshop-subtitle">Master Adaptive Communication to Advance Your Career</p>`,
      `<div class="workshop-facilitator"><img src="https://pub-53e04deae8a14a14b1ca2a2fcfee91f9.r2.dev/speakers/2026-annual-symposium/cm51259add0bb34cf889245e35.png" alt="Claudia Ferryman" width="72" height="86" loading="lazy"><div><button class="profile-trigger" type="button" id="cf-profile-open" aria-haspopup="dialog" aria-controls="cf-profile">Claudia Ferryman</button><p>President · ${link("https://www.rainmakerstrategies.org/", "Rainmaker Strategies Group")}</p></div></div>`,
      `<p>For STEM HQP, technical and research expertise is only one component of career success. The ability to communicate ideas clearly, adapt communication to different audiences, build professional relationships, navigate conversations with confidence, and demonstrate interpersonal effectiveness can be equally important when entering industry environments.</p>`,
      `<p>The workshop will introduce participants to the DISC Communication Framework, providing learners with a practical understanding of their own communication preferences and how different communication styles can influence workplace interactions. Participants will explore how to recognize and adapt to different communication styles, communicate with greater clarity and impact, and navigate situations where others approach communication differently.</p>`,
      `<p>The goal is to help participants translate their strong technical expertise into professional communication capability, an essential skill for networking, interviewing, collaboration, leadership, and career advancement.</p>`,
    ].join("\n"),
  },
  "negotiation-skills-2026": {
    anchor: "negotiation-navigator",
    host: null,
    detailsHtml: [
      `<p class="workshop-subtitle">Learn Effective Strategies to Negotiate with Confidence</p>`,
      `<div class="workshop-facilitator"><img src="https://biohubnet.ca/training-week-2026/glen-whyte-rotman.jpg" alt="Glen Whyte" width="72" height="86" loading="lazy"><div><button class="profile-trigger" type="button" id="gw-profile-open" aria-haspopup="dialog" aria-controls="gw-profile">Glen Whyte</button><p>Professor of Organizational Behaviour and Human Resource Management · ${link("https://www.rotman.utoronto.ca/", "Rotman")}</p></div></div>`,
      `<p>Whether you are a STEM HQP looking to enter a new role, advance your venture or manage stakeholders, you will find yourself in a position where you will need to negotiate.</p>`,
      `<p>Negotiation is an essential skill for success in both professional and personal life. This interactive, hands-on workshop is designed to help participants become more confident and effective negotiators through practical 1:1 negotiation exercises, real-time feedback, and proven negotiation strategies. Participants will explore the fundamentals of distributive and integrative bargaining, learning how to navigate competing interests, make strategic opening offers, and create mutually beneficial agreements.</p>`,
      `<p>The goal is to empower learners with practical tools to be able to plan and prepare for successful negotiations in any professional setting.</p>`,
    ].join("\n"),
  },
  "ccrm-tour-lunch-learn-2026": {
    anchor: "discovery-to-delivery",
    title: "Discovery to Delivery",
    host: "CCRM",
    detailsHtml: [
      `<p class="workshop-subtitle">Learn how advanced therapy products are commercialized</p>`,
      `<p>Step inside ${link("https://www.ccrm.ca/", "CCRM")} (Centre for Commercialization for Regenerative Medicine), a Canadian leader in advancing regenerative medicine and cell and gene therapies from scientific discovery to real-world products. Through partnerships with researchers, industry, entrepreneurs, and investors, ${link("https://www.ccrm.ca/", "CCRM")} helps transform promising discoveries into innovative technologies, companies, and therapies that can ultimately benefit patients.</p>`,
      `<p>During this networking event and tour, explore ${link("https://www.ccrm.ca/", "CCRM")}'s 40,000-square-foot facility, including its Process Development and GMP labs, where technologies are advanced, processes are developed, and regenerative medicine products are prepared for use in humans. Meet the scientists working at the forefront of cell and gene therapy and discover how research moves beyond the lab toward commercialization.</p>`,
    ].join("\n"),
  },
  "innovation-showcase-2026": {
    anchor: "innovation-ignited",
    host: null,
    detailsHtml: [
      `<p class="workshop-subtitle">Showcasing Bold Ideas, Emerging Ventures &amp; the Future of Human Health</p>`,
      `<p>Discover ${link("https://biohubnet.ca/", "BioHubNet")}'s Innovation Showcase, where ambitious human health ventures take centre stage. Watch trainees across Canada pitch their ventures in a high-energy pitch competition, and hear candid insights from experienced entrepreneurs during a Founders Panel. The Venture Showcase will spotlight early-stage innovations through an interactive poster session, giving participants the opportunity to explore upcoming new technologies.</p>`,
      `<p>Whether you're building a venture or simply curious about research translation and commercialization, this is an opportunity to discover emerging ideas, learn from founders, connect with innovators, industry leaders, investors, members of the broader innovation ecosystem and expand your network.</p>`,
      `<p>Explore what it takes to move human health innovations from the lab toward real-world impact.</p>`,
    ].join("\n"),
  },
};
