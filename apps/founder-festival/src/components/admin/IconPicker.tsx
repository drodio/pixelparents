"use client";

import { useRef, useState } from "react";

// Shared icon/logo picker for the Hosts and Sponsors editors. Three ways to set
// the image: drag-and-drop, click-to-upload, or web-search-and-pick (Exa). All
// three POST to the same per-entity endpoint (`uploadPath`) — a file via
// FormData, or a picked search result via JSON { imageUrl } (the server copies
// it into our Blob). Calls onChange with the resulting public URL.
type Props = {
  currentUrl: string | null;
  uploadPath: string;
  // Seeds the search box (the host/sponsor name) at load time.
  searchSeed: string;
  // Sponsors are usually transparent logos → contain on white; host icons → cover.
  fit?: "cover" | "contain";
  // Size of the current-image preview box. Defaults to a square thumbnail; pass
  // a wider class (e.g. "h-16 w-48") for a banner-style preview.
  previewClass?: string;
  onChange: (url: string) => void;
};

export function IconPicker({ currentUrl, uploadPath, searchSeed, fit = "cover", previewClass = "h-16 w-16", onChange }: Props) {
  const [url, setUrl] = useState(currentUrl);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [query, setQuery] = useState(searchSeed);
  const [results, setResults] = useState<string[] | null>(null);
  const [searching, setSearching] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function apply(newUrl: string) {
    setUrl(newUrl);
    onChange(newUrl);
  }

  async function uploadFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(uploadPath, { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) apply(data.url ?? data.iconUrl ?? data.logoUrl);
      else setErr(data.error ?? `Upload failed (${res.status})`);
    } catch {
      setErr("Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function pickImage(imageUrl: string) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(uploadPath, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageUrl }),
      });
      const data = await res.json();
      if (res.ok) {
        apply(data.url ?? data.iconUrl ?? data.logoUrl);
        setResults(null);
      } else {
        setErr(data.error ?? `Couldn't use that image (${res.status})`);
      }
    } catch {
      setErr("Couldn't use that image");
    } finally {
      setBusy(false);
    }
  }

  async function search() {
    const q = query.trim();
    if (q.length < 2) return;
    setSearching(true);
    setErr(null);
    setResults(null);
    try {
      const res = await fetch(`/api/admin/icon-search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (res.ok) setResults(data.images ?? []);
      else setErr(data.error ?? "Search failed");
    } catch {
      setErr("Search failed");
    } finally {
      setSearching(false);
    }
  }

  const fitClass = fit === "contain" ? "object-contain bg-white/5" : "object-cover";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className={`${previewClass} shrink-0 rounded border border-zinc-800 ${fitClass}`} />
        ) : (
          <div className={`${previewClass} shrink-0 rounded bg-zinc-800`} aria-hidden />
        )}
        {/* Drag-and-drop zone (also click to browse). */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            uploadFile(e.dataTransfer.files?.[0] ?? null);
          }}
          onClick={() => fileRef.current?.click()}
          className={`flex-1 cursor-pointer rounded-md border border-dashed px-3 py-4 text-center text-sm transition-colors ${
            dragOver
              ? "border-[#dfa43a] bg-[#dfa43a]/10 text-zinc-200"
              : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
          }`}
        >
          {busy ? "Working…" : "Drag an image here, or click to upload"}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => uploadFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      {/* Web search for a logo. */}
      <div className="flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
          placeholder="Search the web for a logo"
          className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
        />
        <button
          type="button"
          onClick={search}
          disabled={searching}
          className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
        >
          {searching ? "Searching…" : "Search"}
        </button>
      </div>

      {err && <p className="text-sm text-red-400">{err}</p>}

      {results &&
        (results.length === 0 ? (
          <p className="text-sm text-zinc-500">No logos found — try a different search or upload a file.</p>
        ) : (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {results.map((img) => (
              <button
                key={img}
                type="button"
                onClick={() => pickImage(img)}
                disabled={busy}
                title="Use this image"
                className="aspect-square overflow-hidden rounded-md border border-zinc-800 bg-white/5 hover:border-[#dfa43a] disabled:opacity-50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt="" loading="lazy" className="h-full w-full object-contain" />
              </button>
            ))}
          </div>
        ))}
    </div>
  );
}
