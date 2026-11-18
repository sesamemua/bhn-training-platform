import { z } from "zod";

const Photos = z.object({ photos: z.array(z.object({
  url: z.url({ protocol: /^https$/ }),
  name: z.string().trim().min(1).max(200),
})).max(20) });

export function socialPhotos(assetSpec: unknown) {
  const parsed = Photos.safeParse(assetSpec);
  return parsed.success ? parsed.data.photos : [];
}
