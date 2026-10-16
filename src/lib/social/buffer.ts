import { z } from "zod";

// Fixed to the verified company Page, never the connected personal profile.
export const BUFFER_CHANNEL_ID = "6ad0ebc6778b240e2f19d8cd";
export const BUFFER_CHANNEL_URL = `https://publish.buffer.com/channels/${BUFFER_CHANNEL_ID}/schedule`;

export class BufferRejected extends Error {}

export async function bufferRequest(query: string, variables: Record<string, unknown> = {}) {
  const key = process.env.BUFFER_API_KEY;
  if (!key || key === "[SENSITIVE]") throw new Error("Buffer publishing is not configured.");
  const response = await fetch("https://api.buffer.com", {
    method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(25_000),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, variables }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.errors?.length || !result?.data) {
    throw new Error("Buffer could not complete the request. Check the API key permissions and channel connection.");
  }
  return result.data;
}

export async function connectedBufferPage() {
  const data = await bufferRequest(`query { channel(input: { id: "${BUFFER_CHANNEL_ID}" }) {
    id name displayName service type isDisconnected isLocked
  } }`);
  const channel = z.object({ id: z.literal(BUFFER_CHANNEL_ID), name: z.string(), displayName: z.string().nullable(),
    service: z.literal("linkedin"), type: z.literal("page"), isDisconnected: z.literal(false), isLocked: z.literal(false),
  }).safeParse(data.channel);
  if (!channel.success || ![channel.data.name, channel.data.displayName].some(name => name?.toLowerCase() === "biohubnet")) {
    throw new Error("The BioHubNet LinkedIn Page needs to be reconnected in Buffer.");
  }
  return channel.data;
}

export const BufferPostSchema = z.object({ id: z.string().min(1), channelId: z.literal(BUFFER_CHANNEL_ID),
  status: z.enum(["draft", "error", "needs_approval", "scheduled", "sending", "sent"]), sentAt: z.iso.datetime().nullable(),
  dueAt: z.iso.datetime().nullable().optional(),
});
export type BufferPost = z.infer<typeof BufferPostSchema>;

export async function createBufferPost(text: string, image: string, alt: string, dueAt?: string): Promise<BufferPost> {
  const data = await bufferRequest(`mutation Publish($input: CreatePostInput!) {
    createPost(input: $input) { ... on PostActionSuccess { post { id channelId status sentAt dueAt } }
      ... on MutationError { message } }
  }`, { input: { channelId: BUFFER_CHANNEL_ID, text, schedulingType: "automatic", mode: dueAt ? "customScheduled" : "shareNow",
    ...(dueAt ? { dueAt } : {}),
    needsApproval: false, saveToDraft: false, assets: [{ image: { url: image, metadata: { altText: alt } } }],
  } });
  if (data.createPost?.message) throw new BufferRejected(String(data.createPost.message).slice(0, 500));
  return BufferPostSchema.parse(data.createPost?.post);
}

export async function readBufferPost(id: string): Promise<BufferPost> {
  const data = await bufferRequest(`query Status($input: PostInput!) { post(input: $input) { id channelId status sentAt dueAt } }`, { input: { id } });
  return BufferPostSchema.parse(data.post);
}
