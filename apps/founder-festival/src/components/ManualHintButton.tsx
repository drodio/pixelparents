"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Super-admin control in the AdminProfileBox: attach a manual "name hint" to a
// profile that no public API can read (e.g. a LinkedIn profile the owner set to
// private — Exa AND EnrichLayer both come back empty, so the scorer gets nothing).
// Saving the hint stores it and re-scores with it seeded into the research.
type Props = {
  evaluationId: string;
  currentHint?: string | null;
};

export function ManualHintButton({ evaluationId, currentHint = null }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState((currentHint ?? "").split("\n")[0] ?? "");
  const [about, setAbout] = useState((currentHint ?? "").split("\n").slice(1).join("\n"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/profiles/${evaluationId}/hint`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), about: about.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed");
        setBusy(false);
        return;
      }
      setOpen(false);
      setBusy(false);
      router.refresh();
    } catch {
      setError("Network error");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs uppercase tracking-[0.2em] text-zinc-500 hover:text-zinc-200"
      >
        Name Hint
      </button>
      {open && (
        <div className="fixed bottom-16 left-3 z-50 w-80 rounded-lg border border-white/15 bg-black/90 p-3 text-left text-sm text-zinc-100 shadow-xl backdrop-blur">
          <div className="mb-2 text-xs text-white/50">
            For profiles no public API can read (private LinkedIn). First name + last name, then roles/about. Saving re-scores with it.
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name (e.g. Jordan Lee)"
            className="mb-2 w-full rounded border border-white/15 bg-black/60 px-2 py-1 text-sm text-white placeholder:text-white/30"
          />
          <textarea
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            placeholder="Roles / about (e.g. Co-President of MIT Alumni Angels; pitch advisor; angel investor in …)"
            rows={4}
            className="mb-2 w-full rounded border border-white/15 bg-black/60 px-2 py-1 text-sm text-white placeholder:text-white/30"
          />
          {error && <div className="mb-2 text-xs text-red-400">{error}</div>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy || !name.trim()}
              className="rounded bg-[#D4A24A] px-3 py-1 text-xs font-medium text-black hover:bg-[#E0B05A] disabled:opacity-40"
            >
              {busy ? "Saving & re-scoring…" : "Save & Re-score"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-white/40 hover:text-white">
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
