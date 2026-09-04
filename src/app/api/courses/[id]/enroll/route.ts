import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, isAdmin, isStaff } from "@/lib/auth";
import { trackServer } from "@/lib/analytics";
import { ensureMerchUnlocks } from "@/lib/rewards/merch";
import { getTraineeCourseLimit } from "@/lib/settings";

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: courseId } = await params;
  const session = await requireSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id?: string }).id!;
  const role = (session.user as { role?: string }).role ?? "user";

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  if (course.status === "archived") {
    return NextResponse.json(
      { error: "This course is archived — new enrolment is closed.", code: "archived" },
      { status: 409 },
    );
  }
  if (course.status !== "published") {
    return NextResponse.json({ error: "Course not available" }, { status: 404 });
  }

  const existing = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });
  if (existing && existing.status === "active") {
    return NextResponse.json(existing);
  }

  // Trainees can have at most N concurrent active courses (configurable
  // by superadmin at /admin/settings). Staff are exempt — the cap is a
  // learner-fairness constraint, not a security boundary.
  const traineeLimit = await getTraineeCourseLimit();
  if (!isStaff(role)) {
    const activeCount = await prisma.enrollment.count({
      where: {
        userId,
        status: "active",
        // Re-enrolling into a course you already had does not double-count
        NOT: existing ? { id: existing.id } : undefined,
      },
    });
    if (activeCount >= traineeLimit) {
      return NextResponse.json(
        {
          error: `You can have up to ${traineeLimit} active courses at a time. Complete or withdraw from one before enrolling in another.`,
          code: "concurrent_limit",
          limit: traineeLimit,
          currentActive: activeCount,
        },
        { status: 409 }
      );
    }
  }

  // Approval gate. When the course requires admin review, the
  // user-facing enrol creates a Pending row and skips the credit
  // deduction. Credits are charged on admin approval (so a rejected
  // request never costs the trainee anything). Admins enrolling on
  // someone's behalf still bypass the gate.
  const needsApproval = course.requiresApproval && !isAdmin(role);

  if (!needsApproval) {
    // Deduct credits for regular users (admins/superadmins bypass)
    if (!isAdmin(role) && course.creditCost > 0) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
      if (!user || user.credits < course.creditCost) {
        return NextResponse.json(
          { error: `Insufficient credits. Need ${course.creditCost}, have ${user?.credits ?? 0}.` },
          { status: 402 }
        );
      }

      const newBalance = user.credits - course.creditCost;
      await prisma.$transaction([
        prisma.user.update({ where: { id: userId }, data: { credits: newBalance } }),
        prisma.creditTransaction.create({
          data: {
            userId,
            amount: -course.creditCost,
            type: "debit",
            reason: "enrollment",
            courseId,
            balanceAfter: newBalance,
          },
        }),
      ]);
    }
  }

  const enrollment = await prisma.enrollment.upsert({
    where: { userId_courseId: { userId, courseId } },
    update: { status: needsApproval ? "pending" : "active" },
    create: { userId, courseId, status: needsApproval ? "pending" : "active" },
  });

  // Loyalty unlock — every credit-spending enrollment is a chance to
  // cross a merch threshold. Idempotent + sandbox-safe; safe to await
  // synchronously since it does at most one count + a couple inserts.
  // We don't await this on no-cost courses (admin path) because no
  // debit means no progress toward "lifetime spent".
  if (!isAdmin(role) && course.creditCost > 0) {
    try {
      await ensureMerchUnlocks(prisma, userId);
    } catch (err) {
      // Don't fail the enrollment if the loyalty side errors — the
      // /rewards page calls ensureMerchUnlocks on every load and will
      // self-heal next time the trainee visits.
      console.error("ensureMerchUnlocks failed for", userId, err);
    }
  }

  await trackServer({
    userId,
    role,
    name: "enroll",
    props: { courseId, courseTitle: course.title, creditCost: course.creditCost },
  });

  return NextResponse.json(enrollment, { status: 201 });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: courseId } = await params;
  const session = await requireSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id?: string }).id!;
  await prisma.enrollment.updateMany({
    where: { userId, courseId },
    data: { status: "withdrawn" },
  });

  return NextResponse.json({ ok: true });
}
