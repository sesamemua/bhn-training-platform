/** How a Design Review artwork names the social post its graphic belongs to. Pure. */
export const SOCIAL_SOURCE_PREFIX = "social:";
export const socialSource = (postId: string) => `${SOCIAL_SOURCE_PREFIX}${postId}`;
