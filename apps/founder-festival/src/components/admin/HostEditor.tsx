"use client";

import { useState } from "react";
import { AdminProfilePicker, type PickerResult } from "@/components/admin/AdminProfilePicker";
import { IconPicker } from "@/components/admin/IconPicker";
import { MarkdownField } from "@/components/admin/MarkdownField";
import { useAutosave, AutosaveStatus } from "@/components/admin/useAutosave";
import { slugify } from "@/lib/slugify";

export type HostAttachedProfile = { evaluationId: string; fullName: string | null; slug: string | null; slugKind: string | null };

export function HostEditor({
  hostId,
  initial,
  initialProfiles,
}: {
  hostId: string;
  initial: { name: string; blurb: string; url: string; slug: string; iconUrl: string | null };
  initialProfiles: HostAttachedProfile[];
}) {
  const [name, setName] = useState(initial.name);
  const [blurb, setBlurb] = useState(initial.blurb);
  const [url, setUrl] = useState(initial.url);
  const [slug, setSlug] = useState(initial.slug);
  const [iconUrl, setIconUrl] = useState(initial.iconUrl);
  const [profiles, setProfiles] = useState<HostAttachedProfile[]>(initialProfiles);
  const [msg, setMsg] = useState<string | null>(null);
  const { status, schedule } = useAutosave();

  // Auto-save (debounced) the host's text fields on every change. Surfaces a
  // server error (e.g. a slug already used by another host) inline.
  function persist(fields: { name: string; blurb: string; url: string; slug: string }) {
    schedule(async () => {
      const res = await fetch(`/api/admin/hosts/${hostId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setMsg(data.error ?? `Save failed (${res.status})`);
        return false;
      }
      setMsg(null);
      return true;
    });
  }

  async function attach(r: PickerResult) {
    setMsg(null);
    const res = await fetch(`/api/admin/hosts/${hostId}/profiles`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ evaluationId: r.id }),
    });
    const data = await res.json();
    if (res.ok) {
      setProfiles((p) => (p.some((x) => x.evaluationId === data.profile.evaluationId) ? p : [...p, data.profile]));
    } else {
      setMsg(`Error: ${data.error ?? res.status}`);
    }
  }

  async function detach(evaluationId: string) {
    const res = await fetch(`/api/admin/hosts/${hostId}/profiles`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ evaluationId }),
    });
    if (res.ok) setProfiles((p) => p.filter((x) => x.evaluationId !== evaluationId));
  }

  const input = "rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white";

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <IconPicker
        currentUrl={iconUrl}
        uploadPath={`/api/admin/hosts/${hostId}/icon`}
        searchSeed={name}
        fit="cover"
        previewClass="h-16 w-48"
        onChange={setIconUrl}
      />
      <label className="flex flex-col gap-1">
        <span className="text-sm text-zinc-300">Name</span>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            persist({ name: e.target.value, blurb, url, slug });
          }}
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-zinc-300">URL slug</span>
        <input
          value={slug}
          onChange={(e) => {
            const next = slugify(e.target.value);
            setSlug(next);
            persist({ name, blurb, url, slug: next });
          }}
          placeholder="zero-zero-guild"
          className={input}
        />
        <span className="text-xs text-zinc-500">festival.so/hosts/{slug || "…"}</span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-zinc-300">About</span>
        <MarkdownField
          value={blurb}
          onChange={(v) => {
            setBlurb(v);
            persist({ name, blurb: v, url, slug });
          }}
          rows={5}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-zinc-300">Click-out URL</span>
        <input
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            persist({ name, blurb, url: e.target.value, slug });
          }}
          placeholder="https://…"
          className={input}
        />
      </label>
      <div className="flex items-center gap-3">
        <AutosaveStatus status={status} />
        {msg && <span className="text-sm text-red-400">{msg}</span>}
      </div>

      <div className="flex flex-col gap-3 border-t border-zinc-800 pt-5">
        <h3 className="text-sm font-medium text-zinc-300">People at this host</h3>
        <p className="text-xs text-zinc-500">
          Search existing Founder Festival profiles to attach the people who work here. They
          appear under the host on the public recap. Not on the leaderboard yet? Score them
          (opens a new tab), then search again.
        </p>
        <AdminProfilePicker onAttach={attach} excludeIds={new Set(profiles.map((p) => p.evaluationId))} />
        {profiles.length > 0 && (
          <ul className="flex flex-col gap-2">
            {profiles.map((p) => (
              <li key={p.evaluationId} className="flex items-center justify-between rounded-md border border-zinc-800 px-3 py-2 text-sm">
                <span className="text-zinc-200">{p.fullName ?? p.evaluationId}</span>
                <button type="button" onClick={() => detach(p.evaluationId)} className="text-xs text-red-400 hover:text-red-300">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
