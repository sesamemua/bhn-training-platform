import { requireRole } from '@/lib/auth';
import { loadFeedbackHistory } from '@/lib/page-review/feedback-history-store';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if (!await requireRole('admin').catch(()=>null)) return Response.json({ error:'Forbidden.' },{status:403});
  const reviewId = new URL(request.url).searchParams.get('review') || undefined;
  const history = await loadFeedbackHistory(reviewId);
  return Response.json({ schema:1, scope:reviewId ?? 'all-projects-separated', generatedAt:new Date().toISOString(), ...history },{
    headers:{'Cache-Control':'private, no-store','Content-Disposition':'attachment; filename="review-feedback-history.json"'},
  });
}
