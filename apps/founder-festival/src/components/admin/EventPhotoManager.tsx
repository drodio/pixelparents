"use client";

import { useState, useRef } from "react";
import { upload } from "@vercel/blob/client";
import { resizeImageForWeb } from "@/lib/resize-image";
import { CaptionMentionInput } from "@/components/events/CaptionMentionInput";

export type AdminPhoto = {
  id: string;
  blobUrl: string;
  source: string;
  visibility: string;
  caption: string | null;
  captionManual: boolean;
  sortOrder: number;
};

// Per-photo caption field that auto-saves ~0.6s after you stop typing (no need
// to blur/tab away), with a small "Saving…/Saved" indicator. Supports @-mention
// of members (stored as @[Name](evalId) markers, rendered as profile links in
// the carousel).
function CaptionInput({ initial, onSave }: { initial: string; onSave: (v: string) => Promise<void> }) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onChange(next: string) {
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await onSave(next.trim());
      setStatus("saved");
    }, 600);
  }

  return (
    <div className="flex flex-col gap-0.5">
      <CaptionMentionInput initial={initial} onChange={onChange} placeholder="Caption — @ to mention" />
      {status !== "idle" && (
        <span className="text-[10px] text-zinc-500">{status === "saving" ? "Saving…" : "Saved"}</span>
      )}
    </div>
  );
}

export function EventPhotoManager({
  eventId,
  initialPhotos,
}: {
  eventId: string;
  initialPhotos: AdminPhoto[];
}) {
  const [photos, setPhotos] = useState<AdminPhoto[]>(initialPhotos);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<"public" | "claimed" | "attendees">("public");
  const [uploadCaption, setUploadCaption] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function onUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setErr(null);
    try {
      for (const original of Array.from(files)) {
        // Downscale + re-encode to a web size in the browser first, so we never
        // upload the full-resolution original (often 5-15MB off a phone).
        const file = await resizeImageForWeb(original);
        // Upload straight from the browser to Vercel Blob — the bytes bypass our
        // serverless function (and its ~4.5MB request-body limit), so large
        // camera photos work. ./photos/upload mints the short-lived client token.
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const blob = await upload(`events/${eventId}/${safeName}`, file, {
          access: "public",
          handleUploadUrl: `/api/admin/events/${eventId}/photos/upload`,
        });
        // Then record the (small) metadata so it shows in the list + recap.
        const res = await fetch(`/api/admin/events/${eventId}/photos`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ blobUrl: blob.url, visibility, caption: uploadCaption.trim() || null }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `Upload failed (${res.status})`);
        setPhotos((p) => [...p, data.photo]);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function patch(id: string, body: Partial<AdminPhoto>) {
    const res = await fetch(`/api/admin/events/${eventId}/photos/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const { photo } = await res.json();
      setPhotos((p) => p.map((x) => (x.id === id ? photo : x)));
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this photo?")) return;
    const res = await fetch(`/api/admin/events/${eventId}/photos/${id}`, { method: "DELETE" });
    if (res.ok) setPhotos((p) => p.filter((x) => x.id !== id));
  }

  // Drag-to-reorder. First photo (index 0) is the cover. We optimistically
  // reorder locally and persist the full id order; sortOrder = index server-side.
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  function handleDrop(targetIdx: number) {
    const from = dragIdx;
    setDragIdx(null);
    if (from === null || from === targetIdx) return;
    const next = [...photos];
    const [moved] = next.splice(from, 1);
    next.splice(targetIdx, 0, moved);
    setPhotos(next);
    void fetch(`/api/admin/events/${eventId}/photos/reorder`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: next.map((p) => p.id) }),
    });
  }

  // AI captioning. `busy` tracks per-photo "Re-Run" spinners; `captionAllBusy`
  // is the bulk run. Generated captions are auto (captionManual=false); editing
  // the caption input (debounced PATCH) flips it to manual server-side.
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [captionAllBusy, setCaptionAllBusy] = useState(false);
  // Per-photo version that bumps when a caption changes from OUTSIDE the input
  // (auto-caption / clear). The CaptionInput is keyed by it, so it remounts with
  // the new value — while plain typing leaves it alone (no cursor jump).
  const [capVer, setCapVer] = useState<Record<string, number>>({});
  const bumpCap = (id: string) => setCapVer((v) => ({ ...v, [id]: (v[id] ?? 0) + 1 }));

  async function autoCaption(id: string) {
    setBusy((b) => ({ ...b, [id]: true }));
    setErr(null);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/photos/${id}/caption`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "caption failed");
      setPhotos((p) => p.map((x) => (x.id === id ? data.photo : x)));
      bumpCap(id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Caption failed");
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  }

  async function captionAll() {
    setCaptionAllBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/photos/caption-all`, { method: "POST" });
      const data = (await res.json()) as { captions?: Record<string, string>; error?: string };
      if (!res.ok) throw new Error(data.error ?? "caption failed");
      const captions = data.captions ?? {};
      setPhotos((p) =>
        p.map((x) => (captions[x.id] ? { ...x, caption: captions[x.id], captionManual: false } : x)),
      );
      setCapVer((v) => {
        const next = { ...v };
        for (const id of Object.keys(captions)) next[id] = (next[id] ?? 0) + 1;
        return next;
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Caption failed");
    } finally {
      setCaptionAllBusy(false);
    }
  }

  function clearCaption(id: string) {
    setPhotos((p) => p.map((x) => (x.id === id ? { ...x, caption: null, captionManual: false } : x)));
    bumpCap(id);
    void patch(id, { caption: "" });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as "public" | "claimed" | "attendees")}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
        >
          <option value="public">Upload as: Public</option>
          <option value="claimed">Upload as: Members Only</option>
          <option value="attendees">Upload as: Attendees Only</option>
        </select>
        <input
          type="text"
          value={uploadCaption}
          onChange={(e) => setUploadCaption(e.target.value)}
          placeholder="Caption (optional)"
          className="min-w-[12rem] flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => onUpload(e.target.files)}
          className="text-sm text-zinc-400 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-sm file:text-zinc-200"
        />
        {uploading && <span className="text-sm text-zinc-400">Uploading…</span>}
        {err && <span className="text-sm text-red-400">{err}</span>}
      </div>

      {photos.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={captionAll}
            disabled={captionAllBusy}
            className="rounded-md border border-[#dfa43a] px-3 py-1.5 text-sm font-medium text-[#dfa43a] transition-colors hover:bg-[#dfa43a]/10 disabled:opacity-50"
          >
            {captionAllBusy ? "Auto-captioning…" : "✨ Auto-caption all"}
          </button>
          <span className="text-xs text-zinc-500">
            Uses the event description + learnings. Skips photos you&apos;ve captioned manually.
          </span>
        </div>
      )}

      {photos.length === 0 ? (
        <p className="text-sm text-zinc-500">No photos yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {photos.map((p, i) => (
            <div
              key={p.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(i)}
              className={`flex flex-col gap-2 rounded-md border p-2 transition-opacity ${
                dragIdx === i ? "border-[#dfa43a] opacity-50" : "border-zinc-800"
              }`}
            >
              {/* Only the image is draggable, so the caption input stays editable. */}
              <div
                draggable
                onDragStart={() => setDragIdx(i)}
                onDragEnd={() => setDragIdx(null)}
                className="relative cursor-move"
                title="Drag to reorder"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.blobUrl} alt={p.caption ?? ""} className="aspect-video w-full rounded object-cover" />
                {i === 0 && (
                  <span className="absolute left-1 top-1 rounded bg-[#dfa43a] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-black">
                    Cover
                  </span>
                )}
                <span className="absolute right-1 top-1 select-none rounded bg-black/60 px-1 text-xs text-white/70" aria-hidden>
                  ⠿
                </span>
              </div>
              <div className="flex items-start gap-1">
                <div className="min-w-0 flex-1">
                  {/* capVer bumps on auto-caption/clear so the input remounts with
                      the new value; typing leaves capVer alone (no cursor jump). */}
                  <CaptionInput
                    key={`cap-${p.id}-${capVer[p.id] ?? 0}`}
                    initial={p.caption ?? ""}
                    onSave={(v) => patch(p.id, { caption: v })}
                  />
                </div>
                {p.caption && (
                  <button
                    type="button"
                    onClick={() => clearCaption(p.id)}
                    aria-label="Clear caption"
                    title="Clear caption"
                    className="shrink-0 rounded border border-zinc-700 px-1.5 py-1 text-xs text-zinc-400 hover:text-white"
                  >
                    ✕
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => autoCaption(p.id)}
                disabled={busy[p.id]}
                className="self-start text-[11px] text-[#dfa43a] hover:underline disabled:opacity-50"
              >
                {busy[p.id] ? "Captioning…" : p.caption ? "✨ Re-Run caption" : "✨ Auto-caption"}
              </button>
              <div className="flex items-center justify-between gap-2">
                <select
                  value={p.visibility}
                  onChange={(e) => patch(p.id, { visibility: e.target.value as "public" | "claimed" | "attendees" })}
                  className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-white"
                >
                  <option value="public">Public</option>
                  <option value="claimed">Members Only</option>
                  <option value="attendees">Attendees Only</option>
                </select>
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Delete
                </button>
              </div>
              <span className="text-[10px] uppercase tracking-wide text-zinc-600">{p.source}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
