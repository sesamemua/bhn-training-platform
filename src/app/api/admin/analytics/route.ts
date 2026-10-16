import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

const NOT_SHORTCUT = { NOT: { name: { startsWith: "shortcut_" } } };

export async function GET(req: NextRequest) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const rawDays = searchParams.get("days") ?? "30";
  // 'all' or 0 means since the very beginning of the platform
  const allTime = rawDays === "all" || rawDays === "0";
  const days = allTime
    ? 0
    : Math.min(3650, Math.max(1, Number(rawDays) || 30));

  // For all-time, anchor 'since' at the earliest user creation; falling back
  // to a far-past date if there are no users yet.
  let since: Date;
  if (allTime) {
    const oldest = await prisma.user.findFirst({
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    since = oldest?.createdAt ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  } else {
    since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }
  const effectiveDays = allTime
    ? Math.max(1, Math.ceil((Date.now() - since.getTime()) / (24 * 60 * 60 * 1000)))
    : days;

  // Parallel aggregations
  const [
    totalUsers,
    newUsersInRange,
    totalEvents,
    eventsInRange,
    activeUsersInRange,
    completionsInRange,
    enrollmentsInRange,
    certificatesInRange,
    eventNamesAgg,
    deviceAgg,
    roleAgg,
    themeAgg,
    topPaths,
    topCourses,
    funnel,
    userGrowthDaily,
    activityDaily,
  ] = await Promise.all([
    prisma.user.count({ where: { accountKind: "real" } }),
    prisma.user.count({ where: { createdAt: { gte: since }, accountKind: "real" } }),
    // shortcut_* rows are the consent-free personal-shortcut feature, not analytics.
    prisma.event.count({ where: NOT_SHORTCUT }),
    prisma.event.count({ where: { createdAt: { gte: since }, ...NOT_SHORTCUT } }),
    // distinct active users via raw SQL for speed
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT "userId") AS count
      FROM "Event"
      WHERE "createdAt" >= ${since} AND "userId" IS NOT NULL AND name NOT LIKE 'shortcut\_%'
    `.then((r) => Number(r[0]?.count ?? 0)),
    prisma.enrollment.count({ where: { status: "completed", completedAt: { gte: since } } }),
    prisma.enrollment.count({ where: { enrolledAt: { gte: since } } }),
    prisma.certificate.count({ where: { issueDate: { gte: since }, revokedAt: null } }),
    prisma.event.groupBy({
      by: ["name"],
      where: { createdAt: { gte: since }, ...NOT_SHORTCUT },
      _count: { _all: true },
      orderBy: { _count: { name: "desc" } },
      take: 10,
    }),
    prisma.event.groupBy({
      by: ["device"],
      where: { createdAt: { gte: since }, ...NOT_SHORTCUT },
      _count: { _all: true },
    }),
    prisma.user.groupBy({
      by: ["role"],
      _count: { _all: true },
    }),
    prisma.$queryRaw<Array<{ theme: string; count: bigint }>>`
      SELECT props->>'theme' AS theme, COUNT(*)::bigint AS count
      FROM "Event"
      WHERE name = 'theme_change' AND "createdAt" >= ${since}
        AND props ? 'theme'
      GROUP BY props->>'theme'
      ORDER BY count DESC
      LIMIT 10
    `,
    prisma.$queryRaw<Array<{ path: string; count: bigint; users: bigint }>>`
      SELECT path AS path, COUNT(*)::bigint AS count, COUNT(DISTINCT "userId")::bigint AS users
      FROM "Event"
      WHERE name = 'page_view' AND "createdAt" >= ${since} AND path IS NOT NULL
      GROUP BY path
      ORDER BY count DESC
      LIMIT 10
    `,
    prisma.$queryRaw<Array<{ courseId: string; views: bigint; enrolls: bigint }>>`
      SELECT
        COALESCE(props->>'courseId', '') AS "courseId",
        COUNT(*) FILTER (WHERE name = 'page_view' AND path LIKE '/courses/%')::bigint AS views,
        COUNT(*) FILTER (WHERE name = 'enroll')::bigint AS enrolls
      FROM "Event"
      WHERE "createdAt" >= ${since}
        AND ((name = 'page_view' AND path LIKE '/courses/%') OR (name = 'enroll'))
      GROUP BY props->>'courseId'
      ORDER BY views DESC NULLS LAST
      LIMIT 10
    `,
    {
      registered:   await prisma.event.count({ where: { name: "register",       createdAt: { gte: since } } }),
      visited_courses: await prisma.event.count({ where: { name: "page_view",   path: "/courses",  createdAt: { gte: since } } }),
      viewed_a_course: await prisma.event.count({ where: { name: "page_view",   path: { startsWith: "/courses/" }, createdAt: { gte: since } } }),
      enrolled:     await prisma.event.count({ where: { name: "enroll",         createdAt: { gte: since } } }),
      completed:    await prisma.event.count({ where: { name: "scorm_complete", createdAt: { gte: since } } }),
    },
    prisma.$queryRaw<Array<{ d: Date; n: bigint }>>`
      SELECT date_trunc('day', "createdAt") AS d, COUNT(*)::bigint AS n
      FROM "User"
      WHERE "createdAt" >= ${since}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    prisma.$queryRaw<Array<{ d: Date; views: bigint; users: bigint }>>`
      SELECT date_trunc('day', "createdAt") AS d,
             COUNT(*)::bigint AS views,
             COUNT(DISTINCT "userId")::bigint AS users
      FROM "Event"
      WHERE "createdAt" >= ${since} AND name = 'page_view'
      GROUP BY 1
      ORDER BY 1 ASC
    `,
  ]);

  // Resolve top course IDs to titles
  const courseIds = topCourses.map((r) => r.courseId).filter(Boolean) as string[];
  const courseLookup = courseIds.length
    ? await prisma.course.findMany({
        where: { id: { in: courseIds } },
        select: { id: true, title: true },
      })
    : [];
  const titleMap = new Map(courseLookup.map((c) => [c.id, c.title]));

  // Build daily series with zero-fills across the requested window
  function fillDays<T extends { d: Date }>(rows: T[]): Array<T & { day: string }> {
    const map = new Map<string, T>();
    for (const r of rows) map.set(r.d.toISOString().slice(0, 10), r);
    const out: Array<T & { day: string }> = [];
    for (let i = effectiveDays - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      const row = map.get(key);
      out.push({ ...(row ?? ({ d } as T)), day: key });
    }
    return out;
  }

  return NextResponse.json({
    range: { days: effectiveDays, since: since.toISOString(), allTime },
    summary: {
      totalUsers,
      newUsers: newUsersInRange,
      totalEvents,
      eventsInRange,
      activeUsers: activeUsersInRange,
      enrollments: enrollmentsInRange,
      completions: completionsInRange,
      certificates: certificatesInRange,
    },
    funnel,
    eventNames: eventNamesAgg.map((r) => ({ name: r.name, count: r._count._all })),
    devices: deviceAgg.map((r) => ({ device: r.device ?? "unknown", count: r._count._all })),
    roles: roleAgg.map((r) => ({ role: r.role, count: r._count._all })),
    themes: themeAgg.map((r) => ({ theme: r.theme, count: Number(r.count) })),
    topPaths: topPaths.map((r) => ({ path: r.path, views: Number(r.count), users: Number(r.users) })),
    topCourses: topCourses
      .filter((r) => r.courseId)
      .map((r) => ({
        courseId: r.courseId,
        title: titleMap.get(r.courseId) ?? r.courseId,
        views: Number(r.views),
        enrolls: Number(r.enrolls),
      })),
    userGrowth: fillDays(userGrowthDaily.map((r) => ({ ...r, n: Number(r.n) })))
      .map((r) => ({ day: r.day, n: (r as unknown as { n?: number }).n ?? 0 })),
    activity: fillDays(
      activityDaily.map((r) => ({ ...r, views: Number(r.views), users: Number(r.users) }))
    ).map((r) => ({
      day: r.day,
      views: (r as unknown as { views?: number }).views ?? 0,
      users: (r as unknown as { users?: number }).users ?? 0,
    })),
  });
}
