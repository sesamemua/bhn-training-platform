/**
 * Pre-fill the current newsletter issue's TOP STORY with the 2026 Annual
 * Symposium & Training Week, taken from biohubnet.ca/2026-annual-symposium/
 * and /training-week-2026/ (21 Sep 2026).
 *
 * The layout goes in with it, stamped with `_src` the way Generate stamps
 * its own, so "Lay out with AI" keeps this wording until somebody edits
 * the text — then the AI lays the edit out as usual.
 *
 * Dry run by default. Skips an issue that already has a top story.
 *
 *   npx tsx scripts/prefill-newsletter-top-story.ts [--force]
 */
import { prisma } from "../src/lib/prisma";
import { currentCycle } from "../src/lib/newsletter/currentIssue";
import type { PieceLayout } from "../src/lib/newsletter/types";

const PROGRAM = "https://biohubnet.ca/2026-annual-symposium/";
const REGISTER = "https://luma.com/wh30nh1n";
const TRAINING_WEEK = "https://biohubnet.ca/training-week-2026/";

const rawBody = `2026 Annual Symposium & Training Week — registration is open

The Future Workforce: Skills, Leadership, and Innovation in a changing world.

BioHubNet's Annual Symposium brings Canada's biomanufacturing and life sciences community together to connect emerging talent, training partners, innovators, industry, academia and funders for a day of cross-sectoral conversations and connections.

Symposium: Thursday, October 29, 2026, 8:30 AM–6:00 PM ET, Chelsea Hotel Toronto (2nd Floor, Mountbatten Salon), 33 Gerrard St W, Toronto.
Tickets: Trainees / HQP $15 · Professionals $50. Register: ${REGISTER}
Program: keynote by Christopher Procyshyn, former CEO of Vanrx Pharmasystems; three panels — AI in the Workplace, Expanding Career Horizons, and Building Biomanufacturing Capacity in Canada; the EQUIP VentureLift Showcase; structured networking with industry professionals; a networking reception. Full program: ${PROGRAM}

Training Week: October 26–28, 2026 — applied learning, professional development, company tours and networking opportunities, including the Communication Chameleon workshop with Claudia Ferryman. Activities are being finalized: ${TRAINING_WEEK}`;

const layout = {
  headline: "2026 Annual Symposium & Training Week",
  subhead: "The Future Workforce: Skills, Leadership, and Innovation in a changing world",
  body: [
    "Symposium registration is open. Training Week (October 26–28) brings applied learning, professional development, company tours and networking. On October 29, the Annual Symposium brings Canada's biomanufacturing and life sciences community together for a keynote from Christopher Procyshyn, three panels, the EQUIP VentureLift Showcase and a networking reception.",
  ],
  glance: [
    { label: "TRAINING WEEK", value: "October 26–28, 2026" },
    { label: "SYMPOSIUM", value: "Thursday, October 29 · Chelsea Hotel Toronto" },
    { label: "TICKETS", value: "Trainees / HQP $15 · Professionals $50" },
  ],
  links: [
    { label: "Symposium Program", url: PROGRAM },
    { label: "Training Week", url: TRAINING_WEEK },
  ],
  ctaLabel: "Register Now",
  ctaUrl: REGISTER,
} satisfies PieceLayout;

async function main() {
  const force = process.argv.includes("--force");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  const cycle = await currentCycle(today);
  if (!cycle?.issueId) {
    throw new Error("The current cycle has no issue yet. Open the Newsletter page once, then run this again.");
  }
  const issue = await prisma.newsletterIssue.findUniqueOrThrow({
    where: { id: cycle.issueId },
    select: { id: true, title: true, pieces: { where: { section: "top" }, select: { id: true } } },
  });
  console.log(`Current issue: ${issue.title} (${issue.id}) — sends ${cycle.sendDate}`);
  if (issue.pieces.length > 0) {
    console.log("It already has a top story. Nothing to do.");
    return;
  }
  if (!force) {
    console.log(`Dry run. Would add this top story:\n\n${rawBody}\n\nRun with --force to write it.`);
    return;
  }
  const created = await prisma.newsletterPiece.create({
    data: {
      issueId: issue.id,
      section: "top",
      position: 0,
      rawBody,
      sourceUrl: REGISTER,
      authorName: "Pre-filled from biohubnet.ca",
      status: "normalised",
      layout: { ...layout, _src: rawBody },
    },
    select: { id: true },
  });
  console.log(`Added the top story (${created.id}).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
