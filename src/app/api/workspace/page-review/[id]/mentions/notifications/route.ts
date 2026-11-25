import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { acknowledgeReviewMentions, reviewMentionHistory, reviewMentionNotifications } from '@/lib/page-review/mentions';
import { SOCIAL_COPY_REVIEW_PREFIX } from '@/lib/social/copy-review';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
async function recipient(context: Context) {
  const { id } = await context.params;
  const session = await requireRole(id.startsWith(SOCIAL_COPY_REVIEW_PREFIX) ? 'admin' : 'instructor').catch(() => null);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return Response.json({ error: 'Forbidden.' }, { status: 403 });
  if (!await prisma.pageReview.findUnique({ where: { id }, select: { id: true } })) return Response.json({ error: 'No such review.' }, { status: 404 });
  return { id, userId };
}
export async function GET(request: Request, context: Context) {
  const viewer = await recipient(context);
  if (viewer instanceof Response) return viewer;
  const params = new URL(request.url).searchParams;
  if (params.get('history') === '1') {
    const cursor = params.get('cursor') ?? undefined;
    if (cursor && cursor.length > 400) return Response.json({ error: 'Invalid history cursor.' }, { status: 400 });
    return Response.json(await reviewMentionHistory(viewer.id, viewer.userId, cursor), { headers: { 'Cache-Control': 'private, no-store' } });
  }
  return Response.json({ notifications: await reviewMentionNotifications(viewer.id, viewer.userId) }, { headers: { 'Cache-Control': 'private, no-store' } });
}
const acknowledgement = z.object({ ids: z.array(z.string().min(1).max(400)).min(1).max(100) }).strict();
export async function POST(request: Request, context: Context) {
  const viewer = await recipient(context);
  if (viewer instanceof Response) return viewer;
  const origin = request.headers.get('origin');
  if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && origin !== new URL(request.url).origin)) return Response.json({ error: 'Forbidden.' }, { status: 403 });
  if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({ error: 'Expected JSON.' }, { status: 415 });
  const parsed = acknowledgement.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Choose valid mention notifications.' }, { status: 400 });
  return Response.json(await acknowledgeReviewMentions(viewer.id, viewer.userId, parsed.data.ids), { headers: { 'Cache-Control': 'private, no-store' } });
}
