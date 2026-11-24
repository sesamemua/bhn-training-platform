import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { reviewMentionPeople } from '@/lib/page-review/mentions';
import { SOCIAL_COPY_REVIEW_PREFIX } from '@/lib/social/copy-review';

export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const session = await requireRole(id.startsWith(SOCIAL_COPY_REVIEW_PREFIX) ? 'admin' : 'instructor').catch(() => null);
  if (!(session?.user as { id?: string } | undefined)?.id) return Response.json({ error: 'Forbidden.' }, { status: 403 });
  if (!await prisma.pageReview.findUnique({ where: { id }, select: { id: true } })) return Response.json({ error: 'No such review.' }, { status: 404 });
  return Response.json({ people: await reviewMentionPeople() }, { headers: { 'Cache-Control': 'private, no-store' } });
}
