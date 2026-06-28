"use client";

import { useState } from "react";
import { AdminProfilePicker, type PickerResult } from "@/components/admin/AdminProfilePicker";
import { IconPicker } from "@/components/admin/IconPicker";
import { MarkdownField } from "@/components/admin/MarkdownField";
import { useAutosave, AutosaveStatus } from "@/components/admin/useAutosave";

export type AttachedProfile = { evaluationId: string; fullName: string | null; slug: string | null; slugKind: string | null };

export function SponsorEditor({
  sponsorId,
  initial,
  initialProfiles,
}: {
  sponsorId: string;
  initial: { name: string; blurb: string; websiteUrl: string; logoUrl: string | null };
  initialProfiles: AttachedProfile[];
}) {
  const [name, setName] = useState(initial.name);
  const [blurb, setBlurb] = useState(initial.blurb);
  const [websiteUrl, setWebsiteUrl] = useState(initial.websiteUrl);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [profiles, setProfiles] = useState<AttachedProfile[]>(initialProfiles);
  const [msg, setMsg] = useState<string | null>(null);
  const { status, schedule } = useAutosave();

  const input = "rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white";

  // Auto-save (debounced) the sponsor's text fields on every change.
  function persist(fields: { name: string; blurb: string; websiteUrl: string }) {
    schedule(async () => {
      const res = await fetch(`/api/admin/sponsors/${sponsorId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(fields),
      });
      return res.ok;
    });
  }

  async function attach(r: PickerResult) {
    setMsg(null);
    const res = await fetch(`/api/admin/sponsors/${sponsorId}/profiles`, {
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
    const res = await fetch(`/api/admin/sponsors/${sponsorId}/profiles`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ evaluationId }),
    });
    if (res.ok) setProfiles((p) => p.filter((x) => x.evaluationId !== evaluationId));
  }

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <div className="flex flex-col gap-4">
        <IconPicker
          currentUrl={logoUrl}
          uploadPath={`/api/admin/sponsors/${sponsorId}/logo`}
          searchSeed={name}
          fit="contain"
          previewClass="h-16 w-48"
          onChange={setLogoUrl}
        />
        <label className="flex flex-col gap-1">
          <span className="text-sm text-zinc-300">Name</span>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              persist({ name: e.target.value, blurb, websiteUrl });
            }}
            className={input}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-zinc-300">About</span>
          <MarkdownField
            value={blurb}
            onChange={(v) => {
              setBlurb(v);
              persist({ name, blurb: v, websiteUrl });
            }}
            rows={5}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-zinc-300">Website URL</span>
          <input
            value={websiteUrl}
            onChange={(e) => {
              setWebsiteUrl(e.target.value);
              persist({ name, blurb, websiteUrl: e.target.value });
            }}
            placeholder="https://…"
            className={input}
          />
        </label>
        <div className="flex items-center gap-3">
          <AutosaveStatus status={status} />
          {msg && <span className="text-sm text-red-400">{msg}</span>}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-zinc-300">People at this sponsor</h3>
        <p className="text-xs text-zinc-500">
          Search existing Founder Festival profiles to attach the people who work here. They
          appear under the sponsor on the public recap. Not on the leaderboard yet? Score them
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
