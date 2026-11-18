import { Download, Expand } from "lucide-react";
import { socialPhotos } from "@/lib/social/photos";

export function SocialPostPhotos({ postId, assetSpec }: { postId: string; assetSpec: unknown }) {
  const photos = socialPhotos(assetSpec);
  if (!photos.length) return null;
  const download = `/api/admin/social/graphics?ids=${encodeURIComponent(postId)}`;
  return <section aria-label="Post photos" className="space-y-3 border-t border-line p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">Photos ({photos.length})</h3>
      <a href={`${download}&zip=1`} className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700">
        <Download size={16} /> Download all photos
      </a>
    </div>
    <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
      {photos.map((photo, index) => <figure key={photo.url} className="min-w-0">
        <a href={photo.url} target="_blank" rel="noopener noreferrer" aria-label={`View full photo ${index + 1}: ${photo.name}`} className="group relative block bg-elevated">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} alt={`Post photo ${index + 1}: ${photo.name}`} className="aspect-[3/2] w-full object-contain" loading="lazy" />
          <Expand size={16} aria-hidden="true" className="absolute right-2 top-2 rounded bg-black/60 p-1 text-white size-6" />
        </a>
        <figcaption className="flex min-w-0 items-center justify-between gap-2 pt-1 text-xs text-muted">
          <span className="min-w-0 break-all">{photo.name}</span>
          <a href={`${download}&photo=${index}`} aria-label={`Download ${photo.name}`} title={`Download ${photo.name}`} className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-brand-700 hover:bg-elevated"><Download size={16} /></a>
        </figcaption>
      </figure>)}
    </div>
  </section>;
}
