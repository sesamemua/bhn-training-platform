/**
 * BioHubNet's LinkedIn page, as anyone can see it: followers, and the
 * reactions and comments on recent posts.
 *
 * Read from what LinkedIn shows visitors who are not signed in, because
 * the page's own analytics (impressions, visitors) need an approved
 * LinkedIn API app. Followers come from LinkedIn's embeddable Follow
 * button (a 2 KB page made to be fetched from other sites); posts from
 * the public company page. Both are cached for 30 minutes, so the
 * dashboard never asks LinkedIn more often than that.
 */

export const LINKEDIN_PAGE = "https://www.linkedin.com/company/biohubnet";
/** LinkedIn's own Follow button for the page, which prints the follower count. Also embeddable as a fallback. */
export const LINKEDIN_FOLLOW_WIDGET = "https://www.linkedin.com/pages-extensions/FollowCompany?id=102677155&counter=bottom";

export interface LinkedInPost {
  url: string;
  published: string;
  text: string;
  reactions: number;
  comments: number;
}

export interface LinkedInSnapshot {
  followers: number | null;
  /** Posts on the page in the last 30 days, newest first. Reshares are left out. Null when the page could not be read. */
  posts: LinkedInPost[] | null;
}

const count = (raw: string | undefined) => (raw ? Number(raw.replace(/,/g, "")) : 0);

/** The count printed by the Follow button: `<div class="follower-count">2,305`. */
export function parseFollowWidget(html: string): number | null {
  const m = html.match(/class="follower-count">\s*([\d,]+)/);
  return m ? count(m[1]) : null;
}

/** When a post went up, from its activity id: LinkedIn ids carry the millisecond timestamp in their top bits. */
export function activityDate(id: string): Date {
  // Number() rounds ids this large, but only in bits the division throws away.
  return new Date(Math.floor(Number(id) / 4194304));
}

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'").replace(/&nbsp;/g, " ");

/**
 * Followers and recent posts from the public page's HTML. Pure, so it can
 * be tested on a saved page.
 *
 * Posts are read from their cards alone. The page's structured data has
 * dates too, but LinkedIn leaves the posts out of it in the copy it sends
 * cloud servers — which is where this runs.
 */
export function parseLinkedInPage(html: string, now = new Date()): { followers: number | null; posts: LinkedInPost[] } {
  const followers = html.match(/([\d,]+)\s+followers/);
  const monthAgo = now.getTime() - 30 * 86_400_000;
  const starts = [...html.matchAll(/data-activity-urn="urn:li:activity:(\d+)"/g)];
  const posts: LinkedInPost[] = [];
  starts.forEach((m, i) => {
    const card = html.slice(m.index, starts[i + 1]?.index ?? m.index + 60_000);
    if (/\breposted\b/i.test(card)) return; // someone else's post, shared
    const published = activityDate(m[1]);
    if (published.getTime() < monthAgo) return;
    const commentary = card.match(/main-feed-activity-card__commentary"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "";
    posts.push({
      url: `https://www.linkedin.com/feed/update/urn:li:activity:${m[1]}/`,
      published: published.toISOString(),
      text: decode(commentary.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 120),
      reactions: count(card.match(/(\d[\d,]*)\s*Reactions?/)?.[1]),
      comments: count(card.match(/(\d[\d,]*)\s*Comments?/)?.[1]),
    });
  });
  return {
    followers: followers ? count(followers[1]) : null,
    posts: posts.sort((x, y) => y.published.localeCompare(x.published)),
  };
}

async function page(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.warn(`[metrics] LinkedIn answered ${res.status} for ${url}`);
    return res.ok ? await res.text() : null;
  } catch (err) {
    console.warn(`[metrics] LinkedIn did not answer ${url}:`, (err as Error).message);
    return null;
  }
}

/** Null when LinkedIn answered neither request — the dashboard then embeds the Follow button instead. */
export async function linkedinSnapshot(): Promise<LinkedInSnapshot | null> {
  const [widget, company] = await Promise.all([page(LINKEDIN_FOLLOW_WIDGET), page(LINKEDIN_PAGE)]);
  const fromPage = company ? parseLinkedInPage(company) : null;
  if (company) {
    // What LinkedIn actually sent this server: it can differ from what a browser gets.
    console.info("[metrics] LinkedIn page", {
      bytes: company.length,
      postCards: (company.match(/data-activity-urn=/g) ?? []).length,
      postsIn30Days: fromPage?.posts.length ?? 0,
      signInWall: /authwall|join now to see/i.test(company),
    });
  }
  const followers = (widget ? parseFollowWidget(widget) : null) ?? fromPage?.followers ?? null;
  const posts = fromPage && fromPage.followers !== null ? fromPage.posts : null;
  return followers === null && posts === null ? null : { followers, posts };
}
