import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { cn, statusColor } from "@/lib/utils";
import { Users, BookOpen, TrendingUp, Award, Coins, ClipboardList } from "lucide-react";
import Link from "next/link";
import { isPausedPath, withoutPaused } from "@/lib/deploy/paused";

interface RecentEnrollment {
  id: string; status: string; enrolledAt: Date;
  user: { name: string | null; email: string };
  course: { title: string };
}
interface RecentUser {
  id: string; name: string | null; email: string;
  role: string; createdAt: Date; credits: number;
}

export default async function AdminPage() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");

  const [
    totalUsers,
    activeUsers,
    publishedCourses,
    totalEnrollments,
    completedEnrollments,
    totalCerts,
    totalCreditsGranted,
    recentEnrollments,
    recentUsers,
  ] = await Promise.all([
    prisma.user.count({ where: { accountKind: "real" } }),
    prisma.user.count({ where: { isActive: true, accountKind: "real" } }),
    prisma.course.count({ where: { status: "published" } }),
    prisma.enrollment.count(),
    prisma.enrollment.count({ where: { status: "completed" } }),
    prisma.certificate.count({ where: { revokedAt: null } }),
    prisma.user.aggregate({ _sum: { credits: true } }),
    prisma.enrollment.findMany({
      take: 8,
      orderBy: { enrolledAt: "desc" },
      include: {
        user: { select: { name: true, email: true } },
        course: { select: { title: true } },
      },
    }),
    prisma.user.findMany({
      where: { accountKind: "real" },
      take: 5,
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, email: true, role: true, createdAt: true, credits: true },
    }),
  ]);

  const completionRate =
    totalEnrollments > 0 ? Math.round((completedEnrollments / totalEnrollments) * 100) : 0;
  const totalCredits = totalCreditsGranted._sum.credits ?? 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-fg">Admin Dashboard</h1>
        <p className="text-muted text-sm mt-1">Platform overview and management</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { label: "Total Users", value: totalUsers, sub: `${activeUsers} active`, icon: Users, color: "blue" },
          { label: "Published Courses", value: publishedCourses, icon: BookOpen, color: "green" },
          { label: "Total Enrollments", value: totalEnrollments, icon: ClipboardList, color: "indigo" },
          { label: "Completion Rate", value: `${completionRate}%`, sub: `${completedEnrollments} completed`, icon: TrendingUp, color: "amber" },
          { label: "Certificates", value: totalCerts, icon: Award, color: "purple" },
          { label: "Credits in Circulation", value: totalCredits.toLocaleString(), icon: Coins, color: "orange" },
        ].map((stat) => {
          const Icon = stat.icon;
          const colors: Record<string, string> = {
            blue: "bg-brand-50 text-brand-600",
            amber: "bg-amber-50 text-amber-600",
            green: "bg-green-50 text-green-600",
            purple: "bg-purple-50 text-purple-600",
            indigo: "bg-indigo-50 text-indigo-600",
            orange: "bg-orange-50 text-orange-600",
          };
          return (
            <div key={stat.label} className="bg-card rounded-xl border border-line p-5">
              <div className={`inline-flex p-2 rounded-lg mb-3 ${colors[stat.color]}`}>
                <Icon size={18} />
              </div>
              <p className="text-2xl font-bold text-fg">{stat.value}</p>
              <p className="text-sm text-muted mt-0.5">{stat.label}</p>
              {stat.sub && <p className="text-xs text-subtle mt-0.5">{stat.sub}</p>}
            </div>
          );
        })}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {withoutPaused([
          { label: "Manage Users", href: "/admin/users", color: "bg-brand-600" },
          { label: "Enrollments", href: "/admin/enrollments", color: "bg-indigo-600" },
          { label: "Groups", href: "/admin/groups", color: "bg-violet-600" },
          { label: "Compliance Report", href: "/admin/reports", color: "bg-green-700" },
          { label: "Certificates", href: "/admin/certificates", color: "bg-purple-600" },
          { label: "Announcements", href: "/admin/announcements", color: "bg-amber-700" },
          { label: "Audit Log", href: "/admin/audit", color: "bg-gray-700" },
          { label: "Platform Settings", href: "/admin/settings", color: "bg-slate-600" },
        ]).map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`${l.color} text-white text-sm font-medium rounded-lg px-4 py-3 text-center hover:opacity-90 transition-opacity`}
          >
            {l.label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Enrollments */}
        <div className="bg-card rounded-xl border border-line overflow-hidden">
          <div className="px-5 py-4 border-b border-line flex items-center justify-between">
            <h2 className="font-semibold text-fg">Recent Enrollments</h2>
            {!isPausedPath("/admin/enrollments") && (
              <Link href="/admin/enrollments" className="text-sm text-brand-600 hover:underline">View all</Link>
            )}
          </div>
          <div className="divide-y divide-line">
            {(recentEnrollments as RecentEnrollment[]).map((e: RecentEnrollment) => (
              <div key={e.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-fg">{e.user.name ?? e.user.email}</p>
                  <p className="text-xs text-subtle">{e.course.title}</p>
                </div>
                <div className="text-right">
                  <span className={cn("text-xs px-2 py-0.5 rounded-full", statusColor(e.status))}>
                    {e.status}
                  </span>
                  <p className="text-xs text-subtle mt-1">
                    {new Date(e.enrolledAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* New Users */}
        <div className="bg-card rounded-xl border border-line overflow-hidden">
          <div className="px-5 py-4 border-b border-line flex items-center justify-between">
            <h2 className="font-semibold text-fg">New Users</h2>
            <Link href="/admin/users" className="text-sm text-brand-600 hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-line">
            {(recentUsers as RecentUser[]).map((u: RecentUser) => (
              <div key={u.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-fg">{u.name ?? "—"}</p>
                  <p className="text-xs text-subtle">{u.email}</p>
                </div>
                <div className="text-right">
                  <span className={cn(
                    "text-xs px-2 py-0.5 rounded-full",
                    u.role === "superadmin" ? "bg-rose-100 text-rose-700" :
                    u.role === "admin" ? "bg-brand-100 text-brand-700" :
                    u.role === "instructor" ? "bg-violet-100 text-violet-700" :
                    u.role === "evaluating" ? "bg-amber-100 text-amber-700" :
                    "bg-raised text-muted"
                  )}>
                    {u.role}
                  </span>
                  <p className="text-xs text-subtle mt-1">
                    {u.credits.toLocaleString()} credits
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
