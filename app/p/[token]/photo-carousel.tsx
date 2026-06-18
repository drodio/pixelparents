"use client";

import { useCallback, useEffect, useState } from "react";

// A caption is a list of parts so @-mentioned names can render as links that
// jump to that child's section (href is null when that child isn't shown).
export type CaptionPart =
  | { kind: "text"; text: string }
  | { kind: "mention"; name: string; href: string | null };

export type CarouselPhoto = { url: string; caption?: CaptionPart[] | null };

function captionText(parts?: CaptionPart[] | null): string {
  return (parts ?? []).map((p) => (p.kind === "text" ? p.text : p.name)).join("");
}

// Renders caption parts; @-mentions show as gold names, linked when an anchor
// exists. onNavigate fires on a link click (used to close the lightbox first).
function Caption({
  parts,
  className,
  onNavigate,
}: {
  parts: CaptionPart[];
  className?: string;
  onNavigate?: () => void;
}) {
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.kind === "text" ? (
          <span key={i}>{p.text}</span>
        ) : p.href ? (
          <a
            key={i}
            href={p.href}
            onClick={onNavigate}
            className="font-medium text-amber-400 hover:underline"
          >
            {p.name}
          </a>
        ) : (
          <span key={i} className="font-medium text-amber-400">
            {p.name}
          </span>
        ),
      )}
    </span>
  );
}

// Hand-rolled hero + fan-out carousel with a click-to-expand lightbox
// (festival.so style; no external libraries).
export function PhotoCarousel({ photos }: { photos: CarouselPhoto[] }) {
  const n = photos.length;
  const [center, setCenter] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  const prev = useCallback(() => setCenter((c) => (c - 1 + n) % n), [n]);
  const next = useCallback(() => setCenter((c) => (c + 1) % n), [n]);

  // Arrow keys drive the carousel only while the lightbox is open, so normal
  // page scrolling still works elsewhere. Lock body scroll while open.
  useEffect(() => {
    if (!lightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "Escape") {
        setLightbox(false);
      }
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [lightbox, prev, next]);

  if (n === 0) return null;
  const current = photos[center];

  return (
    <div>
      {/* Full-bleed stage */}
      <div className="relative flex h-56 w-full items-center justify-center overflow-hidden sm:h-72 md:h-80">
        {photos.map((p, i) => {
          let d = i - center;
          if (d > n / 2) d -= n;
          if (d < -n / 2) d += n;
          const abs = Math.abs(d);
          if (abs > 2) return null;
          const isCenter = d === 0;
          return (
            <button
              key={i}
              type="button"
              onClick={() => (isCenter ? setLightbox(true) : setCenter(i))}
              className="absolute transition-all duration-300 ease-out"
              style={{
                transform: `translateX(${d * 42}%) scale(${0.8 ** abs})`,
                zIndex: 30 - abs * 10,
                opacity: abs === 0 ? 1 : abs === 1 ? 0.55 : 0.3,
              }}
              aria-label={isCenter ? "Expand photo" : "Bring photo to center"}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={captionText(p.caption)}
                className="h-44 w-72 rounded-xl object-cover shadow-2xl ring-1 ring-white/10 sm:h-56 sm:w-96 md:h-64"
              />
            </button>
          );
        })}
        {n > 1 && (
          <>
            <button
              type="button"
              onClick={prev}
              className="absolute left-3 z-40 grid h-9 w-9 place-items-center rounded-full bg-black/60 text-lg text-white hover:bg-black/80"
              aria-label="Previous photo"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={next}
              className="absolute right-3 z-40 grid h-9 w-9 place-items-center rounded-full bg-black/60 text-lg text-white hover:bg-black/80"
              aria-label="Next photo"
            >
              ›
            </button>
          </>
        )}
      </div>

      <div className="mt-3 text-center text-sm">
        <span className="text-white/45">
          {center + 1} / {n}
        </span>
        {current?.caption && current.caption.length > 0 && (
          <>
            <span className="text-white/45"> • </span>
            <Caption parts={current.caption} className="text-white/70" />
          </>
        )}
      </div>

      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(false)}
        >
          <button
            type="button"
            onClick={() => setLightbox(false)}
            className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
            aria-label="Close"
          >
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.url}
            alt={captionText(current.caption)}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] max-w-[92vw] rounded-lg object-contain"
          />
          {current?.caption && current.caption.length > 0 && (
            <p
              onClick={(e) => e.stopPropagation()}
              className="mt-3 max-w-2xl text-center text-sm text-white/70"
            >
              <Caption parts={current.caption} onNavigate={() => setLightbox(false)} />
            </p>
          )}
        </div>
      )}
    </div>
  );
}
