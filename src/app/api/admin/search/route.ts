import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getAlgoliaClient, ALGOLIA_INDEX } from "@/lib/algolia";
import { withoutPaused } from "@/lib/deploy/paused";

/**
 * Global admin search — one box, three entities, backed by Algolia
 * (see scripts/algolia-sync.ts for the indexing job that keeps
 * bhn_users / bhn_courses / bhn_postings in sync with Postgres).
 *
 * `clickAnalytics: true` makes Algolia return a `queryID` per section,
 * which we attach to every result so the client can report a click event
 * via POST /api/admin/search/click (see that route for the Insights call).
 */
const RESULTS_PER_TYPE = 5;

interface UserHit { objectID: string; name: string | null; email: string; role: string }
interface CourseHit { objectID: string; title: string; code: string | null }
interface PostingHit { objectID: string; title: string; companyName: string }

export async function GET(req: NextRequest) {
  await requireRole("admin");

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ users: [], courses: [], postings: [] });
  }

  const client = getAlgoliaClient();
  const { results } = await client.search({
    requests: [
      { indexName: ALGOLIA_INDEX.users, query: q, hitsPerPage: RESULTS_PER_TYPE, clickAnalytics: true },
      { indexName: ALGOLIA_INDEX.courses, query: q, hitsPerPage: RESULTS_PER_TYPE, clickAnalytics: true },
      { indexName: ALGOLIA_INDEX.postings, query: q, hitsPerPage: RESULTS_PER_TYPE, clickAnalytics: true },
    ],
  });

  const [userResult, courseResult, postingResult] = results as {
    hits: unknown[];
    queryID?: string;
  }[];
  const users = userResult.hits as UserHit[];
  const courses = courseResult.hits as CourseHit[];
  const postings = postingResult.hits as PostingHit[];

  return NextResponse.json({
    users: users.map((u, i) => ({
      id: u.objectID,
      title: u.name || u.email,
      subtitle: u.name ? `${u.email} · ${u.role}` : u.role,
      href: `/admin/users?kind=real&q=${encodeURIComponent(u.email)}`,
      indexName: ALGOLIA_INDEX.users,
      queryID: userResult.queryID,
      position: i + 1,
    })),
    // Courses and postings open ENGAGE / EXPERIENCE pages; where those are
    // paused, their results would only lead to /paused.
    courses: withoutPaused(courses.map((c, i) => ({
      id: c.objectID,
      title: c.title,
      subtitle: c.code ?? undefined,
      href: `/courses/${c.objectID}`,
      indexName: ALGOLIA_INDEX.courses,
      queryID: courseResult.queryID,
      position: i + 1,
    }))),
    postings: withoutPaused(postings.map((p, i) => ({
      id: p.objectID,
      title: p.title,
      subtitle: p.companyName,
      href: `/admin/internships/${p.objectID}/edit`,
      indexName: ALGOLIA_INDEX.postings,
      queryID: postingResult.queryID,
      position: i + 1,
    }))),
  });
}
