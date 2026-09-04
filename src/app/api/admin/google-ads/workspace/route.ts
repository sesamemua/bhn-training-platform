import { requireRole } from "@/lib/auth";
import { createGoogleAdsWorkspaceHandlers, createGoogleAdsWorkspaceStore } from "@/lib/campaign/google-ads-workspace-store";

export const dynamic = "force-dynamic";

const handlers = createGoogleAdsWorkspaceHandlers({
  authorize: async () => {
    const session = await requireRole("admin");
    const user = session.user as { id: string; name?: string | null };
    return { id: user.id, name: user.name };
  },
  store: createGoogleAdsWorkspaceStore(),
});

export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
export const POST = handlers.POST;
