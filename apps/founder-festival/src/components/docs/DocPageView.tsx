"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SectionAnchors } from "@/components/SectionAnchors";

export type SuggestionView = {
  id: string;
  rationale: string;
  createdAt: string; // ISO
  diffHtml: string; // word-diff of current body → proposed body (red/green)
};

// Renders a docs page. Default: the pre-rendered HTML. Super-admins (canEdit)
// also get a floating action tray (Edit / Review N suggestions). Edit swaps the
// body for a markdown textarea; review lists pending ship-time suggestions with
// Publish/Discard. Mirrors the AdminProfileActions floating-tray pattern.
export function DocPageView({
  slug,
  html,
  bodyMd,
  canEdit,
  suggestions,
}: {
  slug: string;
  html: string;
  bodyMd: string;
  canEdit: boolean;
  suggestions: SuggestionView[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit" | "review">("view");
  const [draft, setDraft] = useState(bodyMd);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/docs/${slug}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bodyMd: draft }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? `Save failed (${res.status})`);
        return;
      }
      setMode("view");
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resolve(id: string, action: "publish" | "discard") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/docs/${slug}/suggestions/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? `Action failed (${res.status})`);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "edit") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-zinc-500">Editing markdown</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="rounded-md bg-[#dfa43a] px-3 py-1.5 text-sm font-semibold text-black hover:bg-[#c98e2a] disabled:opacity-40"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => { setDraft(bodyMd); setMode("view"); }}
              disabled={busy}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500"
            >
              Cancel
            </button>
          </div>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          className="min-h-[70vh] w-full rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 font-mono text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    );
  }

  if (mode === "review") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-zinc-500">
            {suggestions.length} suggested update{suggestions.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={() => setMode("view")}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500"
          >
            Back
          </button>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {suggestions.length === 0 && <p className="text-sm text-zinc-500">No pending suggestions.</p>}
        {suggestions.length > 0 && (
          <p className="text-xs text-zinc-500">
            Newest first. Each diff compares the proposed text to the page as it is now:{" "}
            <span className="diff-del">removed</span> <span className="diff-add">added</span>.
          </p>
        )}
        {suggestions.map((s) => (
          <div key={s.id} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              {s.rationale && <p className="text-sm text-[#dfa43a]">Why: {s.rationale}</p>}
              <span className="shrink-0 text-xs text-zinc-600">{new Date(s.createdAt).toLocaleDateString()}</span>
            </div>
            <div
              className="docs-diff max-h-96 overflow-y-auto rounded border border-zinc-800 bg-[#151515] p-3 text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: s.diffHtml }}
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => resolve(s.id, "publish")}
                disabled={busy}
                className="rounded-md bg-[#dfa43a] px-3 py-1.5 text-sm font-semibold text-black hover:bg-[#c98e2a] disabled:opacity-40"
              >
                Publish
              </button>
              <button
                type="button"
                onClick={() => resolve(s.id, "discard")}
                disabled={busy}
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-red-700 hover:text-red-300"
              >
                Discard
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // view
  return (
    <>
      <article className="docs-prose" dangerouslySetInnerHTML={{ __html: html }} />
      <SectionAnchors />
      {canEdit && (
        <div className="fixed bottom-5 right-5 z-20 flex items-center gap-2 rounded-full border border-zinc-700 bg-[#1b1b1b]/95 px-3 py-2 text-sm shadow-xl backdrop-blur">
          <span className="px-1 text-xs uppercase tracking-wide text-zinc-500">Admin</span>
          <button
            type="button"
            onClick={() => { setDraft(bodyMd); setMode("edit"); }}
            className="rounded-md bg-[#dfa43a] px-3 py-1 text-xs font-semibold text-black hover:bg-[#c98e2a]"
          >
            ✏️ Edit
          </button>
          {suggestions.length > 0 && (
            <button
              type="button"
              onClick={() => setMode("review")}
              className="rounded-md border border-amber-400/50 px-3 py-1 text-xs font-medium text-amber-200 hover:border-amber-400"
            >
              Review {suggestions.length}
            </button>
          )}
        </div>
      )}
    </>
  );
}
