/**
 * Every key a NavItem may carry as `badgeKey`, across the four count
 * fetchers. The Sidebar types its items against this, so a key that no
 * fetcher produces is a compile error rather than a badge that never
 * appears. Type-only imports: nothing here reaches the client bundle.
 */
import type { QueueBadgeKey } from "@/lib/admin/queue-counts";
import type { WorkspaceBadgeKey } from "@/lib/admin/workspace-queue-rules";
import type { TraineeQueueBadgeKey } from "@/lib/trainee/queue-counts";
import type { EmployerQueueBadgeKey } from "@/lib/employer/queue-counts";

export type AnyQueueBadgeKey =
  | QueueBadgeKey
  | WorkspaceBadgeKey
  | TraineeQueueBadgeKey
  | EmployerQueueBadgeKey;

export type AnyQueueCounts = Partial<Record<AnyQueueBadgeKey, number>>;
