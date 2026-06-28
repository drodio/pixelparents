"use client";

import { useEffect, useState, type ReactNode } from "react";
import { renderMentions, mentionsToText } from "@/lib/event-chat-shared";

export type CarouselPhoto = {
  url: string;
  caption?: string | null;
  // Who added the photo (attendee or admin), shown as "added by <name>" under the
  // focused photo. href links to their profile when known.
  addedByName?: string | null;
  addedByHref?: string | null;
  // Locked = the viewer can't access this photo's tier; shown blurred with a
  // lock label (CSS blur only — the source URL is still in the DOM).
  locked?: boolean;
  lockLabel?: string;
};

// Render a (serialized) caption to nodes: @mentions become gold profile links
// without the "@" prefix; plain text stays as-is.
function captionNodes(caption: string) {
  return renderMentions(caption).map((s, i) =>
    s.kind === "mention" ? (
      <a key={i} href={`/profile?e=${s.evalId}`} className="text-[#dfa43a] hover:underline">
        {s.text.replace(/^@/, "")}
      </a>
    ) : (
      <span key={i}>{s.text}</span>
    ),
  );
}

// Photo author citation: "-<name>" in italics, the name linking to their profile
// when known (e.g. "-DROdio"). Rendered after the caption + a period.
function addedByNode(name: string, href: string | null | undefined) {
  return (
    <span className="italic">
      -
      {href ? (
        <a href={href} className="hover:underline">
          {name}
        </a>
      ) : (
        name
      )}
    </span>
  );
}

// Cover-flow photo carousel for the event recap. The centered photo is the
// biggest; up to two photos on each side fan out behind it (Time-Machine style)
// and the whole thing breaks out wider than the text column. Arrow buttons +
// keyboard ← → navigate. Clicking the center photo opens a lightbox (a locked
// photo instead sends the viewer to claim/score at /?find=1). Renders nothing
// when there are no photos.
export function PhotoCarousel({ photos, actionSlot }: { photos: CarouselPhoto[]; actionSlot?: ReactNode }) {
  const [i, setI] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const n = photos.length;

  // Keyboard navigation (and Escape to close the lightbox).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") setI((p) => ((p - 1) % n + n) % n);
      else if (e.key === "ArrowRight") setI((p) => ((p + 1) % n + n) % n);
      else if (e.key === "Escape") setLightbox(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n]);

  if (n === 0) return null;
  const cur = Math.min(i, n - 1);
  const current = photos[cur]!;
  const go = (next: number) => setI(((next % n) + n) % n);
  const claimHref = "/?find=1";

  // Which neighbors to fan out: up to ±2, but never so many that they wrap onto
  // the same photo (keeps small galleries from showing duplicates).
  const maxOffset = Math.min(2, Math.floor((n - 1) / 2));
  const offsets: number[] = [];
  for (let d = -maxOffset; d <= maxOffset; d++) offsets.push(d);

  return (
    <>
      {/* Full-bleed break-out so the photos can be wider than the text column. */}
      <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen overflow-hidden">
        <div className="mx-auto flex max-w-5xl flex-col gap-1 px-4">
          <div className="relative h-[14rem] sm:h-[20rem] md:h-[24rem]">
            {offsets.map((d) => {
              const idx = ((cur + d) % n + n) % n;
              const p = photos[idx]!;
              const abs = Math.abs(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-label={d === 0 ? "Open photo" : d < 0 ? "Previous photo" : "Next photo"}
                  onClick={() => {
                    if (d !== 0) return go(cur + d); // side photo → bring to center
                    if (p.locked) {
                      window.location.href = claimHref; // locked → claim/score
                      return;
                    }
                    setLightbox(true); // center, unlocked → lightbox
                  }}
                  style={{
                    transform: `translate(-50%, -50%) translateX(${d * 40}%) scale(${0.8 ** abs})`,
                    zIndex: 30 - abs * 10,
                    opacity: abs === 0 ? 1 : abs === 1 ? 0.6 : 0.32,
                  }}
                  className="absolute left-1/2 top-1/2 aspect-[3/2] w-[70%] cursor-pointer overflow-hidden rounded-xl border border-zinc-800 bg-black shadow-2xl shadow-black/60 transition-[transform,opacity] duration-300 sm:w-[54%]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={d === 0 ? mentionsToText(p.caption ?? "") : ""}
                    className={`h-full w-full object-cover ${p.locked ? "scale-105 blur-md" : ""}`}
                  />
                  {p.locked && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 text-center">
                      <LockIcon />
                      {abs === 0 && p.lockLabel && (
                        <span className="px-4 text-sm font-medium text-white">{p.lockLabel}</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}

            {n > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous photo"
                  onClick={() => go(cur - 1)}
                  className="absolute left-2 top-1/2 z-40 h-10 w-10 -translate-y-1/2 rounded-full bg-black/60 text-lg leading-none text-white hover:bg-black/80"
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label="Next photo"
                  onClick={() => go(cur + 1)}
                  className="absolute right-2 top-1/2 z-40 h-10 w-10 -translate-y-1/2 rounded-full bg-black/60 text-lg leading-none text-white hover:bg-black/80"
                >
                  ›
                </button>
              </>
            )}
          </div>

          {/* "[caption]. -<name>" directly under the focused photo. */}
          {(current.caption || current.addedByName) && (
            <p className="text-center text-sm text-zinc-400">
              {current.caption && <span className="text-zinc-300">{captionNodes(current.caption)}</span>}
              {current.caption && current.addedByName && ". "}
              {current.addedByName && addedByNode(current.addedByName, current.addedByHref)}
            </p>
          )}

          {/* Position counter + an optional action pill (e.g. "+ Add Your
              Photos"), side by side on one line, matching pill heights. */}
          {(n > 1 || actionSlot) && (
            <div className="flex items-center justify-center gap-2">
              {n > 1 && (
                <div className="rounded bg-black/60 px-2 py-0.5 text-xs text-white">
                  {cur + 1} / {n}
                </div>
              )}
              {actionSlot}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(false)}
        >
          {current.locked ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <LockIcon />
              <span className="text-white">{current.lockLabel}</span>
              <a href={claimHref} className="rounded-md bg-[#dfa43a] px-4 py-2 text-sm font-medium text-black">
                Become a Festival member
              </a>
            </div>
          ) : (
            <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={current.url}
                alt={mentionsToText(current.caption ?? "")}
                className="max-h-[90vh] max-w-[92vw] rounded object-contain"
              />
              {(current.caption || current.addedByName) && (
                <div className="absolute inset-x-0 bottom-0 rounded-b bg-gradient-to-t from-black/85 via-black/55 to-transparent px-4 pb-3 pt-12 text-center text-sm text-zinc-100 backdrop-blur-[2px]">
                  {current.caption && <span>{captionNodes(current.caption)}</span>}
                  {current.caption && current.addedByName && ". "}
                  {current.addedByName && (
                    <span className="text-zinc-300">{addedByNode(current.addedByName, current.addedByHref)}</span>
                  )}
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            aria-label="Close"
            onClick={() => setLightbox(false)}
            className="absolute right-4 top-4 z-10 h-11 w-11 rounded-full bg-black/60 text-xl leading-none text-white hover:bg-black/80"
          >
            ✕
          </button>
          {n > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous photo"
                onClick={(e) => { e.stopPropagation(); go(cur - 1); }}
                className="absolute left-3 top-1/2 z-10 h-11 w-11 -translate-y-1/2 rounded-full bg-black/60 text-2xl leading-none text-white hover:bg-black/80"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Next photo"
                onClick={(e) => { e.stopPropagation(); go(cur + 1); }}
                className="absolute right-3 top-1/2 z-10 h-11 w-11 -translate-y-1/2 rounded-full bg-black/60 text-2xl leading-none text-white hover:bg-black/80"
              >
                ›
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="28" height="28" aria-hidden className="text-white">
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
