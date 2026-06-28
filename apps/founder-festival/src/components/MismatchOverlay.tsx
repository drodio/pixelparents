"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function extractLinkedinHandle(input: string): string {
  let s = input.trim();
  s = s.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  const m = s.match(/linkedin\.com\/in\/(.+)/i);
  if (m) s = m[1];
  return s.split(/[/?#]/)[0];
}

type Props = {
  fullName: string | null;
  open: boolean;
  onClose: () => void;
};

export function MismatchOverlay({ fullName, open, onClose }: Props) {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const url = `https://linkedin.com/in/${extractLinkedinHandle(handle)}`;
    try {
      const res = await fetch("/api/eval", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ linkedinUrl: url }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Something went wrong");
        setBusy(false);
        return;
      }
      router.push(`/profile?e=${json.evaluationId}`);
    } catch {
      setError("Network error — please try again");
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#1c1c1c] border border-zinc-800 rounded-lg max-w-md w-full p-6 sm:p-8 flex flex-col gap-6 text-zinc-100"
      >
        <div className="flex justify-between items-start">
          <h2 className="font-display text-2xl font-bold">
            This is {fullName ? `${fullName}'s` : "someone else's"} profile.
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 text-sm shrink-0 ml-2"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <p className="text-sm text-zinc-400 leading-relaxed">
          Want to score yours instead?
        </p>
        <form onSubmit={submit} className="flex flex-col gap-2">
          <div className="flex flex-col sm:flex-row sm:items-stretch border border-zinc-800 rounded-md overflow-hidden bg-black">
            <span className="px-3 pt-3 pb-1 sm:py-3 text-zinc-500 select-none sm:border-r sm:border-zinc-800 text-xs sm:text-sm whitespace-nowrap">
              https://linkedin.com/in/
            </span>
            <input
              autoFocus
              value={handle}
              onChange={(e) => setHandle(extractLinkedinHandle(e.target.value))}
              placeholder="your-handle"
              className="flex-1 px-3 pb-3 pt-1 sm:py-3 bg-transparent text-zinc-100 placeholder:text-zinc-600 outline-none text-sm"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          <button
            type="submit"
            disabled={busy || handle.trim() === ""}
            className="rounded-md bg-[#dfa43a] text-black font-medium py-3 disabled:opacity-40"
          >
            {busy ? "Working…" : "Check My Score"}
          </button>
        </form>
        {error && <div className="text-sm text-red-400 text-center">{error}</div>}
      </div>
    </div>
  );
}

// Reads ?claim_mismatch=1 from the URL and renders the overlay when present.
// On close, strips the query param via router.replace so reloads don't
// re-show the overlay. Designed to be dropped into /profile alongside the
// success banner — see Task 11.
export function MismatchOverlayController({ fullName }: { fullName: string | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(params.get("claim_mismatch") === "1");
  }, [params]);

  function close() {
    setOpen(false);
    const next = new URLSearchParams(params.toString());
    next.delete("claim_mismatch");
    const qs = next.toString();
    router.replace(window.location.pathname + (qs ? `?${qs}` : ""), { scroll: false });
  }

  return <MismatchOverlay fullName={fullName} open={open} onClose={close} />;
}
