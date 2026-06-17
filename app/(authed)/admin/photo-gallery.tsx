"use client";

import { useEffect, useState } from "react";

export type GalleryPhoto = { url: string; width?: number; height?: number };

// Thumbnail strip that opens a fullscreen, click-through lightbox (prev/next via
// arrows or ← → keys; close via ✕, backdrop, or Esc). Photo URLs are short-lived
// presigned GET URLs for the private Blob store, generated server-side.
export function PhotoGallery({ photos }: { photos: GalleryPhoto[] }) {
  const [idx, setIdx] = useState<number | null>(null);
  const open = idx !== null;
  const n = photos.length;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIdx(null);
      else if (e.key === "ArrowRight") setIdx((i) => (i === null ? i : (i + 1) % n));
      else if (e.key === "ArrowLeft") setIdx((i) => (i === null ? i : (i - 1 + n) % n));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, n]);

  if (n === 0) return <span className="text-white/30">No photos.</span>;

  const go = (delta: number) => setIdx((i) => (i === null ? i : (i + delta + n) % n));

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {photos.map((p, i) => (
          <button
            key={p.url || i}
            type="button"
            onClick={() => setIdx(i)}
            className="overflow-hidden rounded-md ring-1 ring-white/10 transition hover:ring-white/40"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.url}
              alt=""
              referrerPolicy="no-referrer"
              className="h-24 w-24 cursor-zoom-in object-cover"
            />
          </button>
        ))}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setIdx(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photos[idx!].url}
            alt=""
            referrerPolicy="no-referrer"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          />

          <button
            type="button"
            onClick={() => setIdx(null)}
            aria-label="Close"
            className="absolute right-4 top-4 text-3xl leading-none text-white/70 hover:text-white"
          >
            ✕
          </button>

          {n > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); go(-1); }}
                aria-label="Previous"
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-4 py-2 text-3xl leading-none text-white/80 hover:bg-black/80 hover:text-white sm:left-6"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); go(1); }}
                aria-label="Next"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-4 py-2 text-3xl leading-none text-white/80 hover:bg-black/80 hover:text-white sm:right-6"
              >
                ›
              </button>
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-sm text-white/80">
                {idx! + 1} / {n}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
