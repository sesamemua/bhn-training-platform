/**
 * Import the ENGAGE course catalogue from the SharePoint course list.
 *
 *   npx tsx scripts/import-engage-catalogue.ts --file <rows.json>            # dry run
 *   npx tsx scripts/import-engage-catalogue.ts --file <rows.json> --write    # apply
 *
 * Source is "Engage course list <date>.xlsx" on the phm-biohubnet SharePoint
 * (ENGAGE / 4. ENGAGE Catalogue). Convert it to JSON first — one object per
 * row, keys being the sheet's own column headers, plus `_sheet`:
 *
 *   python3 -c "import openpyxl,json; wb=openpyxl.load_workbook('list.xlsx',data_only=True); \
 *     out=[]; [ ... ]; json.dump(out, open('rows.json','w'))"
 *
 * We keep the xlsx→JSON step outside the repo so the app doesn't carry a
 * spreadsheet parser it never uses at runtime.
 *
 * MATCHING: on `title`, case- and punctuation-insensitively. A course that
 * already exists is UPDATED in place, so its enrollments, certificates and
 * progress survive. Nothing is ever deleted — courses in the database but
 * absent from the sheet are reported and left alone, because deleting a
 * Course cascades to its Enrollments, Certificates, Assessments and
 * Favorites. Retiring one is a human decision, not an import's.
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

export interface SheetRow {
  Course?: string | null;
  "Short Course Description"?: string | null;
  "Learning Objectives"?: string | null;
  Assessments?: string | null;
  "Course Developer"?: string | null;
  Status?: string | null;
  Format?: string | null;
  "Duration (mins)"?: string | null;
  Tag?: string | null;
  "Program/Badge/Certificate"?: string | null;
  "Price/license (CAD, before tax)"?: string | null;
  _sheet?: string | null;
}

/** Sheet's developer names → the catalog's canonical provider list. */
const PROVIDER: Record<string, string> = {
  "life sciences talent accelerator": "Talent Accelerator",
  biotalent: "BioTalent Canada",
  uoft: "University of Toronto",
  seneca: "Seneca Polytechnic",
  // CASTL runs several co-branded tracks; the partner is preserved in the
  // programme name, so the provider facet stays a single filterable value.
  "castl/nibrt": "CASTL",
  "castl/cytiva": "CASTL",
  "castl/qrmi": "CASTL",
};

/** Sheet's Tag → canonical catalog topic. Unlisted tags pass through. */
const TOPIC: Record<string, string> = {
  "career insights/professional development": "Career Insights",
};

const norm = (v: string) => v.trim().toLowerCase();

/** Title key for matching — ignores punctuation, case and spacing drift. */
export function titleKey(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[‐-―]/g, "-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function mapProvider(dev: string | null | undefined): string | null {
  if (!dev) return null;
  return PROVIDER[norm(dev)] ?? dev.trim();
}

export function mapTopic(tag: string | null | undefined): string | null {
  if (!tag) return null;
  return TOPIC[norm(tag)] ?? tag.trim();
}

/**
 * Format → the catalog's delivery facet. The instructor-led sheet spells the
 * shape out in prose ("Blended (2 days online synchronous + 3 days in
 * person)"), so match on the leading word and keep the detail for the
 * description.
 */
export function mapDelivery(format: string | null | undefined): string | null {
  if (!format) return null;
  const f = norm(format);
  if (f.startsWith("blended")) return "Blended";
  if (f.startsWith("in person") || f.startsWith("in-person")) return "In-Person";
  if (f.startsWith("online")) return "Online (Synchronous)";
  if (f.startsWith("asynchronous")) return "Asynchronous";
  return format.trim();
}

/**
 * Only the on-demand sheet reports real minutes. The instructor-led sheet
 * uses human spans ("5 days", "15 weeks (5 hours per week)") that would be
 * a lie as an integer, so those return null and the span is kept verbatim
 * in the description instead.
 */
export function mapDuration(value: string | null | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Sheet status → catalog status. The instructor-led rows carry scheduling
 * prose rather than a state; anything not clearly running is staged as a
 * draft so nobody can enrol in a cohort that has already closed.
 */
export function mapStatus(value: string | null | undefined): "published" | "draft" {
  const s = norm(value ?? "");
  if (s === "active" || s.startsWith("currently being offered")) return "published";
  return "draft";
}

/** Learning objectives and the cohort shape belong in the visible copy. */
export function buildDescription(row: SheetRow): string | null {
  const parts: string[] = [];
  const summary = row["Short Course Description"]?.trim();
  if (summary) parts.push(summary);

  const objectives = row["Learning Objectives"]?.trim();
  if (objectives) {
    const bullets = objectives
      .split(/\r?\n/)
      .map((l) => l.replace(/^[••\-\s\t]+/, "").trim())
      .filter(Boolean)
      .map((l) => `- ${l}`);
    if (bullets.length) parts.push(`**Learning objectives**\n${bullets.join("\n")}`);
  }

  // Preserve the parts of Format / Duration that don't survive the facets.
  const format = row.Format?.trim();
  const duration = row["Duration (mins)"]?.trim();
  const extras: string[] = [];
  if (format && mapDelivery(format) !== format) extras.push(format);
  if (duration && mapDuration(duration) === null) extras.push(duration);
  if (extras.length) parts.push(`**Format:** ${extras.join(" · ")}`);

  return parts.length ? parts.join("\n\n") : null;
}

/** Programme / badge name becomes a tag so the catalog can group by it. */
export function buildTags(row: SheetRow): string | null {
  const programme = row["Program/Badge/Certificate"]?.trim();
  return programme || null;
}

export interface Mapped {
  title: string;
  description: string | null;
  provider: string | null;
  topic: string | null;
  delivery: string | null;
  duration: number | null;
  status: "published" | "draft";
  tags: string | null;
  isSpecial: boolean;
  priceCad: number | null;
}

export function mapRow(row: SheetRow): Mapped | null {
  const title = row.Course?.trim();
  if (!title) return null;
  const price = row["Price/license (CAD, before tax)"]?.trim();
  return {
    title,
    description: buildDescription(row),
    provider: mapProvider(row["Course Developer"]),
    topic: mapTopic(row.Tag),
    delivery: mapDelivery(row.Format),
    duration: mapDuration(row["Duration (mins)"]),
    status: mapStatus(row.Status),
    tags: buildTags(row),
    // Instructor-led bootcamps are the catalog's "Special Programs".
    isSpecial: (row._sheet ?? "").toLowerCase().startsWith("instructor"),
    priceCad: price && /^\d+(\.\d+)?$/.test(price) ? Number(price) : null,
  };
}

/**
 * The write path, callable from outside the CLI (the demo reset route runs
 * it nightly with the app's shared client). Upserts every sheet row and,
 * with draftUnlisted, hides published courses the sheet doesn't know about.
 */
export async function applyCatalogue(
  db: PrismaClient,
  rows: SheetRow[],
  opts: { draftUnlisted?: boolean } = {},
): Promise<{ created: number; updated: number; drafted: number }> {
  const mapped = rows.map(mapRow).filter((m): m is Mapped => m !== null);
  const existing = await db.course.findMany({
    select: { id: true, title: true, status: true },
  });
  const byKey = new Map(existing.map((c) => [titleKey(c.title), c]));

  let created = 0;
  let updated = 0;
  for (const m of mapped) {
    const hit = byKey.get(titleKey(m.title));
    const fields = {
      title: m.title, description: m.description, provider: m.provider,
      topic: m.topic, delivery: m.delivery, duration: m.duration,
      status: m.status, tags: m.tags, isSpecial: m.isSpecial,
    };
    if (hit) {
      await db.course.update({ where: { id: hit.id }, data: fields });
      updated++;
    } else {
      await db.course.create({ data: { ...fields, courseType: "external" } });
      created++;
    }
  }

  let drafted = 0;
  if (opts.draftUnlisted) {
    const sheetKeys = new Set(mapped.map((m) => titleKey(m.title)));
    const strays = existing
      .filter((c) => !sheetKeys.has(titleKey(c.title)) && c.status === "published")
      .map((c) => c.id);
    const r = await db.course.updateMany({
      where: { id: { in: strays } },
      data: { status: "draft" },
    });
    drafted = r.count;
  }
  return { created, updated, drafted };
}

async function main() {
  const prisma = new PrismaClient();
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  // Courses already in the catalog but absent from the sheet are seed/demo
  // rows. This hides them without deleting anything, so their enrollments
  // and certificates survive and the change can be undone by republishing.
  const draftUnlisted = args.includes("--draft-unlisted");
  const fileIdx = args.indexOf("--file");
  if (fileIdx === -1 || !args[fileIdx + 1]) {
    throw new Error("Pass --file <rows.json>");
  }

  const rows: SheetRow[] = JSON.parse(readFileSync(args[fileIdx + 1], "utf8"));
  const mapped = rows.map(mapRow).filter((m): m is Mapped => m !== null);

  const existing = await prisma.course.findMany({
    select: {
      id: true, title: true, status: true,
      _count: { select: { enrollments: true, certificates: true } },
    },
  });
  const byKey = new Map(existing.map((c) => [titleKey(c.title), c]));

  const creates: Mapped[] = [];
  const updates: { id: string; from: string; to: Mapped }[] = [];
  for (const m of mapped) {
    const hit = byKey.get(titleKey(m.title));
    if (hit) updates.push({ id: hit.id, from: hit.title, to: m });
    else creates.push(m);
  }
  const sheetKeys = new Set(mapped.map((m) => titleKey(m.title)));
  const untouched = existing.filter((c) => !sheetKeys.has(titleKey(c.title)));

  console.log(`sheet rows            : ${rows.length}`);
  console.log(`mapped courses        : ${mapped.length}`);
  console.log(`→ create              : ${creates.length}`);
  console.log(`→ update in place     : ${updates.length}`);
  console.log(`untouched in database : ${untouched.length}`);
  for (const c of untouched) {
    const d = c._count;
    console.log(`    · ${c.title} (${c.status}, ${d.enrollments} enrol, ${d.certificates} cert)`);
  }

  const noPrice = mapped.filter((m) => m.priceCad === null).length;
  console.log(`\nrows with no listed price: ${noPrice}`);
  console.log("NOTE: price is not written — Course.creditCost is a credit balance, not CAD.");

  if (!write) {
    console.log("\nDRY RUN — nothing written. Re-run with --write to apply.");
    console.log("\nfirst 3 creates:");
    console.log(JSON.stringify(creates.slice(0, 3), null, 1));
    await prisma.$disconnect();
    return;
  }

  const { created, updated, drafted } = await applyCatalogue(prisma, rows, { draftUnlisted });

  console.log(
    `\nwrote: ${created} created, ${updated} updated, ${drafted} unlisted set to draft, 0 deleted.`,
  );
  await prisma.$disconnect();
}

// Run only as a CLI entrypoint — the demo reset route imports this module
// for applyCatalogue() and must not trigger an argv-driven import.
if (process.argv[1] && /import-engage-catalogue/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
