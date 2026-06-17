"use client";

import { useEffect, useState } from "react";
import { MentionCaptionInput, type MentionCandidate } from "@/components/mention-caption-input";
import { MentionText } from "@/components/mention-text";

export type GalleryPhoto = {
  url: string;
  pathname: string;
  caption: string | null;
  width?: number;
  height?: number;
};

// Thumbnail strip that opens a fullscreen, click-through lightbox (prev/next via
// arrows or ← → keys; close via ✕, backdrop, or Esc). Photo URLs are short-lived
// presigned GET URLs for the private Blob store, generated server-side.
//
// When `candidates` + `onSaveCaption` are supplied, each photo also shows its
// caption (with @-mention chips) and can be captioned/tagged inline.
export function PhotoGallery({
  photos,
  candidates = [],
  onSaveCaption,
}: {
  photos: GalleryPhoto[];
  candidates?: MentionCandidate[];
  onSaveCaption?: (pathname: string, caption: string) => Promise<void>;
}) {
  const [items, setItems] = useState(photos);
  const [idx, setIdx] = useState<number | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const open = idx !== null;
  const n = items.length;

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

  async function save(pathname: string) {
    if (!onSaveCaption) return;
    setSaving(true);
    try {
      await onSaveCaption(pathname, draft);
      setItems((xs) =>
        xs.map((p) => (p.pathname === pathname ? { ...p, caption: draft || null } : p)),
      );
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-3">
        {items.map((p, i) => (
          <div key={p.pathname || i} className="flex w-24 flex-col gap-1">
            <button
              type="button"
              onClick={() => setIdx(i)}
              className="overflow-hidden rounded-md ring-1 ring-white/10 transition hover:ring-white/40"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={p.caption ?? ""}
                referrerPolicy="no-referrer"
                className="h-24 w-24 cursor-zoom-in object-cover"
              />
            </button>
            {onSaveCaption ? (
              editing === p.pathname ? (
                <div className="flex w-48 flex-col gap-1">
                  <MentionCaptionInput
                    value={draft}
                    onChange={setDraft}
                    candidates={candidates}
                    placeholder="Caption — @ to tag a child"
                  />
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => save(p.pathname)}
                      className="rounded bg-white px-2 py-0.5 text-xs font-semibold text-black disabled:opacity-50"
                    >
                      {saving ? "…" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="rounded border border-white/20 px-2 py-0.5 text-xs text-white/70 hover:bg-white/10"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(p.pathname);
                    setDraft(p.caption ?? "");
                  }}
                  className="text-left text-xs leading-tight text-white/60 hover:text-white"
                >
                  {p.caption ? (
                    <MentionText caption={p.caption} />
                  ) : (
                    <span className="text-white/30">+ caption / tag</span>
                  )}
                </button>
              )
            ) : (
              p.caption && (
                <span className="text-xs leading-tight text-white/60">
                  <MentionText caption={p.caption} />
                </span>
              )
            )}
          </div>
        ))}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setIdx(null)}
        >
          <figure
            className="flex max-h-full max-w-full flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={items[idx!]!.url}
              alt={items[idx!]!.caption ?? ""}
              referrerPolicy="no-referrer"
              className="max-h-[82vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
            />
            {items[idx!]!.caption && (
              <figcaption className="max-w-xl text-center text-sm text-white/80">
                <MentionText caption={items[idx!]!.caption} />
              </figcaption>
            )}
          </figure>

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
