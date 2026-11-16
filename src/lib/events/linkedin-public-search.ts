import { z } from "zod";
import { LinkedinInput } from "./linkedin";

const endpoint = "https://mcp.exa.ai/mcp?tools=web_search_advanced_exa";
const result = z.object({
  url: z.string().url(),
  author: z.string().nullish(),
  title: z.string().nullish(),
  highlights: z.array(z.string()).nullish(),
});

export function linkedinSearchEntries(payload: string) {
  const matches = z.object({ results: z.array(z.unknown()).max(50) }).parse(JSON.parse(payload)).results;
  return matches.flatMap(row => {
    const parsed = result.safeParse(row);
    if (!parsed.success) return [];
    const { url: href, author, title, highlights } = parsed.data;
    const url = new URL(href);
    if (url.protocol !== "https:" || url.port || url.username || url.password ||
        !/^(?:(?:www|[a-z]{2})\.)?linkedin\.com$/.test(url.hostname)) return [];
    const post = url.pathname.match(/^\/feed\/update\/urn:li:(activity|share|ugcPost):(\d{18,20})\/?$/) ??
      url.pathname.match(/^\/posts\/[^/]+?-(activity|share|ugcPost)-(\d{18,20})(?:-[a-z0-9]+)?\/?$/i);
    if (!post) return [];
    const name = (author && author !== "N/A" ? author : title?.match(/\|\s*([^|]+)$/)?.[1])?.trim();
    if (!name || /^linkedin$/i.test(name)) return [];
    const text = [title, ...(highlights ?? [])].join(" ").replace(/\\n/g, " ").replace(/\s+/g, " ").trim();
    if (!/\bbio[\s-]*hub[\s-]*net(?:26)?\b/i.test(text)) return [];
    const symposium = /\b(symposium|venturelift showcase|structured networking|expanding career horizons)\b/i.test(text);
    const training = /\b(training week|innovation ignited|communication chameleon|negotiation navigator|microbix|ccrm tour)\b/i.test(text);
    if (!symposium && !training) return [];
    const own = /^biohubnet$/i.test(name) || /^\/posts\/biohubnet_/i.test(url.pathname);
    const thanks = symposium && training
      ? "Thank you for sharing your reflections on the BioHubNet Symposium and Training Week. We appreciate you taking the time to highlight what stood out."
      : symposium
        ? "Thank you for sharing your perspective on the BioHubNet Annual Symposium. We appreciate you helping carry the conversation beyond the event."
        : /\bmicrobix\b/i.test(text)
          ? "Thank you for highlighting the Microbix visit during BioHubNet Training Week. Seeing a Canadian biotech company at work offers a perspective that is hard to get in the classroom."
          : "Thank you for sharing your perspective on BioHubNet Training Week. We appreciate you helping others see what the week was about.";
    return [LinkedinInput.parse({
      sourceUrl: `https://www.linkedin.com/feed/update/urn:li:${post[1]}:${post[2]}/`,
      author: name.slice(0, 240),
      kind: "mention",
      topic: symposium && training ? "both" : symposium ? "symposium" : "training_week",
      sourceText: text.slice(0, 1200),
      reply: own ? "" : thanks,
      status: own ? "no_reply" : "pending",
    })];
  }).slice(0, 12);
}

export async function searchLinkedinPublicPosts(now: Date) {
  const startPublishedDate = new Date(Math.max(Date.UTC(2026, 9, 26), now.getTime() - 30 * 86_400_000)).toISOString().slice(0, 10);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "web_search_advanced_exa", arguments: {
        query: "Recent public LinkedIn posts by attendees, mentors, speakers or partners about BioHubNet26, the BioHubNet 2026 Annual Symposium in Toronto, BioHubNet Training Week, Microbix company tour, or Innovation Ignited pitch competition. Find first-hand recaps and discussion, not profiles or unrelated news.",
        includeDomains: ["linkedin.com"], startPublishedDate, numResults: 12, enableHighlights: true, highlightsMaxCharacters: 500,
      } },
    }),
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Search provider returned HTTP ${response.status}.`);
  const body = await response.text();
  const raw = response.headers.get("content-type")?.startsWith("text/event-stream")
    ? body.split(/\r?\n/).find(line => line.startsWith("data: "))?.slice(6)
    : body;
  if (!raw) throw new Error("Search provider returned no result.");
  const envelope = z.object({ result: z.object({
    isError: z.boolean().optional(),
    content: z.array(z.object({ type: z.literal("text"), text: z.string() })).min(1),
  }) }).parse(JSON.parse(raw));
  if (envelope.result.isError) throw new Error("Search provider could not complete the search.");
  return linkedinSearchEntries(envelope.result.content[0].text);
}
