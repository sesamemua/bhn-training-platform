/**
 * Lazy, idempotent seed for the BHN Promo Video Project. Run from the Video
 * Production page so the project is "already created" on first visit — no
 * manual seed step. The Molly script is stored as the original guide's HTML +
 * CSS (format "html") so it keeps its original styling.
 */
import { prisma } from "@/lib/prisma";
import { MOLLY_HTML, MOLLY_CSS } from "./molly-html";
import { SYMPOSIUM_HTML, SYMPOSIUM_CSS, PLAN_VERSION } from "./symposium-comms-html";
import { SPONSORSHIP_HTML, SPONSORSHIP_CSS, SPONSORSHIP_VERSION } from "./sponsorship-html";

const PROJECT_TITLE = "BHN Promo Video Project";
const SCRIPT_TITLE = "Molly Interview Conversation Guide";

const SYMPOSIUM_PROJECT_TITLE = "2026 Annual Symposium & Training Week";
const SYMPOSIUM_SCRIPT_TITLE = "2026 Symposium — Communications Plan";

// Sponsorship lives under the same symposium project — it's the commercial
// half of the same event, so it shares the project rather than spawning a
// near-duplicate one.
const SPONSORSHIP_SCRIPT_TITLE = "Sponsorship Package";

// The symposium plan and the sponsorship package are documents, not videos:
// their own Workspace tabs open them, so they sit outside Video Production
// (which lists category "marketing" only).
export const SYMPOSIUM_CATEGORY = "symposium";

export async function ensureBhnPromoProject(createdById: string | null): Promise<void> {
  let project = await prisma.videoProject.findFirst({
    where: { title: PROJECT_TITLE },
    select: { id: true },
  });
  if (!project) {
    project = await prisma.videoProject.create({
      data: {
        title: PROJECT_TITLE,
        summary: "Promo / introductory video for BHN's target audiences.",
        category: "marketing",
        createdById,
      },
      select: { id: true },
    });
  }

  const existing = await prisma.script.findFirst({
    where: { projectId: project.id, title: SCRIPT_TITLE },
    select: { id: true, format: true },
  });
  if (existing) {
    // Upgrade an earlier sections-format seed to the original-styled HTML so
    // the script keeps the guide's exact look (one-time — leaves html as-is).
    if (existing.format !== "html") {
      await prisma.script.update({
        where: { id: existing.id },
        data: { format: "html", richContent: { kind: "html", html: MOLLY_HTML, css: MOLLY_CSS } },
      });
      await prisma.scriptSection.deleteMany({ where: { scriptId: existing.id } });
    }
    return;
  }
  // Only seed an EMPTY project. Looking the guide up by title alone meant
  // renaming it ("BHN Promo Video") made this create a second copy.
  if (await prisma.script.count({ where: { projectId: project.id } })) return;

  await prisma.script.create({
    data: {
      projectId: project.id,
      title: SCRIPT_TITLE,
      format: "html",
      richContent: { kind: "html", html: MOLLY_HTML, css: MOLLY_CSS },
      createdById,
    },
  });
}

/**
 * Lazy, idempotent seed for the 2026 Annual Symposium & Training Week
 * communications plan. Same shape as the Molly guide: a marketing project
 * holding one "html"-format script so it renders in the HtmlScriptEditor
 * (editable Gantt + full plan, shareable, version history).
 *
 * Content is team-owned once created — we never overwrite the HTML. But we
 * DO keep the stylesheet current: if the module's CSS has changed (e.g. a
 * styling fix like wrapping Gantt labels), we patch only `richContent.css`
 * on the existing script, leaving the edited HTML untouched.
 */
export async function ensureSymposiumCommsProject(createdById: string | null): Promise<void> {
  let project = await prisma.videoProject.findFirst({
    where: { title: SYMPOSIUM_PROJECT_TITLE },
    select: { id: true },
  });
  if (!project) {
    project = await prisma.videoProject.create({
      data: {
        title: SYMPOSIUM_PROJECT_TITLE,
        summary:
          "Communications & marketing plan for the 2026 Annual Symposium and Training Week — Gantt timeline, pre/during/post promotion, sponsorship, and task breakdown.",
        category: SYMPOSIUM_CATEGORY,
        createdById,
      },
      select: { id: true },
    });
  }

  const existing = await prisma.script.findFirst({
    where: { projectId: project.id, title: SYMPOSIUM_SCRIPT_TITLE },
    select: { id: true, richContent: true },
  });
  if (existing) {
    const rc = (existing.richContent as { html?: string; css?: string } | null) ?? null;
    const marker = `data-plan-version="${PLAN_VERSION}"`;
    if (!rc?.html?.includes(marker)) {
      // One-time heal: this doc predates the current pristine baseline
      // (or was created before versioning). Reset it to the module HTML +
      // CSS. Safe because docs carrying the marker are skipped below, so a
      // team's real edits (which keep the marker) are never overwritten.
      await prisma.script.update({
        where: { id: existing.id },
        data: { richContent: { kind: "html", html: SYMPOSIUM_HTML, css: SYMPOSIUM_CSS } },
      });
    } else if (rc.css !== SYMPOSIUM_CSS) {
      // Marker present → keep the team's HTML, only refresh the stylesheet.
      await prisma.script.update({
        where: { id: existing.id },
        data: { richContent: { kind: "html", html: rc.html, css: SYMPOSIUM_CSS } },
      });
    }
    return;
  }

  await prisma.script.create({
    data: {
      projectId: project.id,
      title: SYMPOSIUM_SCRIPT_TITLE,
      format: "html",
      richContent: { kind: "html", html: SYMPOSIUM_HTML, css: SYMPOSIUM_CSS },
      createdById,
    },
  });
}

/**
 * Sponsorship Package — Workspace → Marketing tab. Shares the symposium
 * project (same event, commercial half) and follows the same version-marker
 * heal rule as the comms plan: docs already carrying the current marker keep
 * the team's edits; only pre-baseline docs are reset.
 */
export async function ensureSponsorshipPackageProject(createdById: string | null): Promise<void> {
  let project = await prisma.videoProject.findFirst({
    where: { title: SYMPOSIUM_PROJECT_TITLE },
    select: { id: true },
  });
  if (!project) {
    project = await prisma.videoProject.create({
      data: {
        title: SYMPOSIUM_PROJECT_TITLE,
        summary:
          "Communications & marketing plan for the 2026 Annual Symposium and Training Week — Gantt timeline, pre/during/post promotion, sponsorship, and task breakdown.",
        category: SYMPOSIUM_CATEGORY,
        createdById,
      },
      select: { id: true },
    });
  }

  const existing = await prisma.script.findFirst({
    where: { projectId: project.id, title: SPONSORSHIP_SCRIPT_TITLE },
    select: { id: true, richContent: true },
  });
  if (existing) {
    const rc = (existing.richContent as { html?: string; css?: string } | null) ?? null;
    const marker = `data-sponsorship-version="${SPONSORSHIP_VERSION}"`;
    if (!rc?.html?.includes(marker)) {
      await prisma.script.update({
        where: { id: existing.id },
        data: { richContent: { kind: "html", html: SPONSORSHIP_HTML, css: SPONSORSHIP_CSS } },
      });
    } else if (rc.css !== SPONSORSHIP_CSS) {
      await prisma.script.update({
        where: { id: existing.id },
        data: { richContent: { kind: "html", html: rc.html, css: SPONSORSHIP_CSS } },
      });
    }
    return;
  }

  await prisma.script.create({
    data: {
      projectId: project.id,
      title: SPONSORSHIP_SCRIPT_TITLE,
      format: "html",
      richContent: { kind: "html", html: SPONSORSHIP_HTML, css: SPONSORSHIP_CSS },
      createdById,
    },
  });
}
