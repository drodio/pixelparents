"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { resizeImageForWeb } from "@/lib/resize-image";
import { CaptionMentionInput } from "@/components/events/CaptionMentionInput";

type Vis = "public" | "claimed" | "attendees";

type StagedItem = {
  id: string;
  file: File;
  previewUrl: string;
  blobUrl: string | null;
  caption: string;
  visibility: Vis;
  uploading: boolean; // resizing + pushing to blob
  capBusy: boolean; // auto-caption in flight
  capVer: number; // bumps on auto-caption/clear to remount the caption input
};

let nextId = 0;

// Attendee photo contributor. The pill expands into a staging area: pick photos,
// review them in a grid (each with an auto-suggested caption you can edit or
// clear, plus a visibility selector), then hit "Upload Photos" to publish them
// to the carousel. Photos are pushed to Blob as soon as they're picked (so we
// can auto-caption them), but they only become event photos on the final save.
export function AttendeePhotoUpload({ slug }: { slug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<StagedItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function update(id: string, patch: Partial<StagedItem>) {
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  // Generate a suggested caption for an already-uploaded staged photo.
  async function autoCaption(id: string, blobUrl: string) {
    update(id, { capBusy: true });
    try {
      const res = await fetch(`/api/events/${slug}/photos/caption`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ blobUrl }),
      });
      const data = (await res.json().catch(() => ({}))) as { caption?: string };
      if (res.ok && data.caption) {
        const cap = data.caption;
        // Bump capVer so the (mount-initialized) caption input remounts with the
        // suggestion instead of keeping the user's stale empty text.
        setItems((list) =>
          list.map((it) => (it.id === id ? { ...it, caption: cap, capVer: it.capVer + 1 } : it)),
        );
      }
    } finally {
      update(id, { capBusy: false });
    }
  }

  async function onChoose(files: FileList | null) {
    if (!files || files.length === 0) return;
    setMsg(null);
    setErr(null);
    const staged: StagedItem[] = Array.from(files).map((file) => ({
      id: `s${nextId++}`,
      file,
      previewUrl: URL.createObjectURL(file),
      blobUrl: null,
      caption: "",
      visibility: "public",
      uploading: true,
      capBusy: false,
      capVer: 0,
    }));
    setItems((list) => [...list, ...staged]);
    if (fileRef.current) fileRef.current.value = "";

    // Resize + push each to Blob, then auto-suggest a caption.
    for (const it of staged) {
      try {
        const resized = await resizeImageForWeb(it.file);
        const safeName = resized.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const blob = await upload(`events/${slug}/${Date.now()}-${safeName}`, resized, {
          access: "public",
          handleUploadUrl: `/api/events/${slug}/photos/upload`,
        });
        update(it.id, { blobUrl: blob.url, uploading: false });
        void autoCaption(it.id, blob.url);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Upload failed");
        update(it.id, { uploading: false });
      }
    }
  }

  function removeItem(id: string) {
    setItems((list) => {
      const it = list.find((x) => x.id === id);
      if (it) URL.revokeObjectURL(it.previewUrl);
      return list.filter((x) => x.id !== id);
    });
  }

  async function uploadAll() {
    const ready = items.filter((it) => it.blobUrl);
    if (ready.length === 0) return;
    setSaving(true);
    setErr(null);
    setMsg(null);
    let added = 0;
    try {
      for (const it of ready) {
        const res = await fetch(`/api/events/${slug}/photos`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            blobUrl: it.blobUrl,
            visibility: it.visibility,
            caption: it.caption.trim() || null,
          }),
        });
        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(d.error ?? `save failed (${res.status})`);
        }
        added++;
      }
      items.forEach((it) => URL.revokeObjectURL(it.previewUrl));
      setItems([]);
      setMsg(`Added ${added} photo${added === 1 ? "" : "s"}.`);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setSaving(false);
    }
  }

  const field = "rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-white";
  const anyUploading = items.some((it) => it.uploading);
  const readyCount = items.filter((it) => it.blobUrl).length;

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        // Small pill matched to the carousel's "1/27" counter height (text-xs,
        // px-2 py-0.5) so the two sit on one line at the same height.
        className="rounded border border-[#dfa43a] px-2 py-0.5 text-xs font-medium text-[#dfa43a] transition-colors hover:bg-[#dfa43a]/10"
      >
        + Add Your Photos
      </button>

      {open && (
        <div className="flex w-full max-w-3xl flex-col gap-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <p className="text-sm text-zinc-400">Add photos you took at this event.</p>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rounded-md bg-[#dfa43a] px-4 py-2 text-sm font-medium text-black hover:bg-[#dfa43a]/90"
              >
                Choose Photos
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                {items.map((it) => (
                  <div key={it.id} className="flex flex-col gap-2 rounded-md border border-zinc-800 p-2">
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={it.previewUrl}
                        alt={it.caption}
                        className={`aspect-video w-full rounded object-cover ${it.uploading ? "opacity-50" : ""}`}
                      />
                      {it.uploading && (
                        <span className="absolute inset-0 flex items-center justify-center text-xs text-white">
                          Uploading…
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeItem(it.id)}
                        aria-label="Remove photo"
                        title="Remove photo"
                        className="absolute right-1 top-1 h-6 w-6 rounded-full bg-black/70 text-sm leading-none text-white hover:bg-black/90"
                      >
                        ×
                      </button>
                    </div>

                    <div className="flex items-start gap-1">
                      <div className="min-w-0 flex-1">
                        <CaptionMentionInput
                          key={`${it.id}-${it.capVer}`}
                          initial={it.caption}
                          onChange={(v) => update(it.id, { caption: v })}
                          placeholder={it.capBusy ? "Captioning…" : "Caption — @ to mention"}
                          inputClassName={`w-full ${field}`}
                        />
                      </div>
                      {it.caption && (
                        <button
                          type="button"
                          onClick={() =>
                            setItems((list) =>
                              list.map((x) =>
                                x.id === it.id ? { ...x, caption: "", capVer: x.capVer + 1 } : x,
                              ),
                            )
                          }
                          aria-label="Clear caption"
                          title="Clear caption"
                          className="shrink-0 rounded border border-zinc-700 px-1.5 py-1 text-xs text-zinc-400 hover:text-white"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <select
                        value={it.visibility}
                        onChange={(e) => update(it.id, { visibility: e.target.value as Vis })}
                        className={field}
                      >
                        <option value="public">Public</option>
                        <option value="claimed">Members Only</option>
                        <option value="attendees">Attendees Only</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => it.blobUrl && autoCaption(it.id, it.blobUrl)}
                        disabled={!it.blobUrl || it.capBusy}
                        className="text-[11px] text-[#dfa43a] hover:underline disabled:opacity-50"
                      >
                        {it.capBusy ? "Captioning…" : it.caption ? "✨ Re-Run" : "✨ Auto-caption"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={uploadAll}
                  disabled={saving || anyUploading || readyCount === 0}
                  className="rounded-md bg-[#dfa43a] px-4 py-2 text-sm font-medium text-black hover:bg-[#dfa43a]/90 disabled:opacity-50"
                >
                  {saving ? "Uploading…" : `Upload ${readyCount} Photo${readyCount === 1 ? "" : "s"}`}
                </button>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="text-sm text-zinc-400 hover:text-white"
                >
                  + Add more
                </button>
              </div>
            </>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => onChoose(e.target.files)}
            className="hidden"
          />
          {err && <span className="text-sm text-red-400">{err}</span>}
          {msg && <span className="text-sm text-zinc-300">{msg}</span>}
        </div>
      )}
    </div>
  );
}
