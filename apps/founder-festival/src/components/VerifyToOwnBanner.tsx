"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  evaluationId: string;
  linkedinUrl: string | null;
};

type Step = "intro" | "attest" | "error";

// Shown to a NAME-ONLY (medium-confidence) claimer viewing their own profile.
// They're linked but can't yet manage it; this walks them through earning
// ownership: first a one-click attempt that auto-verifies via a matching
// verified email, then — if that fails — an explicit "this LinkedIn is mine"
// attestation. POST /api/claim/verify does the actual upgrade; on success we
// refresh so the page re-renders as the owner.
export function VerifyToOwnBanner({ evaluationId, linkedinUrl }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("intro");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attestUrl, setAttestUrl] = useState<string | null>(linkedinUrl);

  async function call(attest: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/claim/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ e: evaluationId, attest }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        confidence?: string;
        canAttest?: boolean;
        linkedinUrl?: string | null;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error || `Error ${res.status}`);
        setStep("error");
        return;
      }
      if (data.confidence === "high") {
        router.refresh(); // re-render as the owner
        return;
      }
      if (data.canAttest) {
        setAttestUrl(data.linkedinUrl ?? linkedinUrl);
        setStep("attest");
        return;
      }
      setError("Couldn't verify ownership.");
      setStep("error");
    } catch {
      setError("Network error — try again.");
      setStep("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-[#D4A24A]/40 bg-[#D4A24A]/[0.06] px-4 py-3 text-sm">
      {step === "attest" ? (
        <div className="flex flex-col gap-2">
          <p className="text-zinc-200">
            We couldn&apos;t match a verified email on your account to this profile.
            Confirm the LinkedIn profile we linked is yours and we&apos;ll let you manage it.
          </p>
          {attestUrl && (
            <a
              href={attestUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#D4A24A] hover:text-[#E0B05A] break-all"
            >
              {attestUrl}
            </a>
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => call(true)}
              className="rounded-md bg-[#dfa43a] px-3 py-1.5 font-medium text-black hover:bg-[#e8b452] disabled:opacity-50"
            >
              {busy ? "Verifying…" : "Yes, this is my LinkedIn"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setStep("intro")}
              className="text-zinc-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-zinc-200">
            You&apos;re linked to this profile by your LinkedIn name, but haven&apos;t
            verified ownership yet. Verify to manage it — re-score, edit your info,
            and confirm badges.
          </p>
          {step === "error" && error && <p className="text-red-400">{error}</p>}
          <div>
            <button
              type="button"
              disabled={busy}
              onClick={() => call(false)}
              className="rounded-md bg-[#dfa43a] px-3 py-1.5 font-medium text-black hover:bg-[#e8b452] disabled:opacity-50"
            >
              {busy ? "Verifying…" : "Verify to manage this profile"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
