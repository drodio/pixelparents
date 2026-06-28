"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EvalProgress } from "./EvalProgress";
import { ClaimProfileModal } from "./ClaimProfileModal";
import { EVAL_STEPS, buildScoreTally, buildFoundIdentities, type TallyItem } from "@/lib/eval-steps";

type Props = {
  evaluationId: string;
  // "header" = small all-caps text link · "cta" = full-width gold CTA button ·
  // "link" = inline gold .link (used next to "#N on Leaderboard").
  variant?: "header" | "cta" | "link";
  // Re-scoring is an owner action: the verified owner re-runs directly,
  // and so do admins (regardless of whether they own this specific profile)
  // — the /api/rescore route gates the same way. Anyone else who clicks
  // Re-Score is asked to claim the profile first.
  isOwner?: boolean;
  // Admin / super-admin viewer. Bypasses the claim-gate so support / triage
  // can re-score unclaimed profiles without first claiming them. Computed
  // server-side via isAdmin() and passed in from the page.
  isAdmin?: boolean;
  // Subject's name — personalizes the claim modal ("{firstName}, claim…").
  fullName?: string | null;
};

export function ReScoreButton({ evaluationId, variant = "header", isOwner = false, isAdmin = false, fullName = null }: Props) {
  const router = useRouter();
  const [evaluating, setEvaluating] = useState(false);
  const [evalDone, setEvalDone] = useState(false);
  const [tally, setTally] = useState<TallyItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [claimOpen, setClaimOpen] = useState(false);
  const nextPathRef = useRef<string | null>(null);
  const firstName = (fullName ?? "").trim().split(/\s+/)[0] || null;

  // Claim-gate: a verified owner OR an admin viewer re-scores directly;
  // anyone else is invited to claim the profile first (the re-score runs
  // after they've claimed). The API route gates the same way — keeping
  // these aligned so a UI-bypass doesn't silently 403 at the network call.
  // e is preventDefault/stopPropagation'd so an accidentally-nested anchor
  // (e.g. the giant "{score} → /leaderboard" element above) can't swallow
  // the click.
  function onClick(e?: React.MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    if (!isOwner && !isAdmin) {
      setClaimOpen(true);
      return;
    }
    rescore();
  }

  async function rescore() {
    setError(null);
    nextPathRef.current = null;
    setEvalDone(false);
    setEvaluating(true);
    try {
      const res = await fetch("/api/rescore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ evaluationId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setEvaluating(false);
        setError(json.error || "Rescore failed");
        return;
      }
      // Carry the (possibly-new) eval id through; /profile renders the claimable
      // low-signal view when the retry is still low-signal.
      const nextId = json.evaluationId ?? evaluationId;
      nextPathRef.current = `/profile?e=${nextId}`;
      setTally([
        ...buildFoundIdentities(json.foundIdentities),
        ...buildScoreTally(json.founderBreakdown, json.investorBreakdown),
      ]);
      setEvalDone(true);
    } catch {
      setEvaluating(false);
      setError("Network error — please try again");
    }
  }

  function handleAllProgressDone() {
    if (nextPathRef.current) {
      router.push(nextPathRef.current);
      router.refresh();
    }
  }

  const label = evaluating ? "Rescoring…" : "Re-Score Me";
  const button =
    variant === "cta" ? (
      <button
        type="button"
        onClick={onClick}
        disabled={evaluating}
        className="rounded-md bg-[#D4A24A] hover:bg-[#E0B05A] text-black font-medium px-6 h-12 inline-flex items-center text-sm sm:text-base disabled:opacity-40"
      >
        {label}
      </button>
    ) : variant === "link" ? (
      // Plain gold text link. The adjacent Leaderboard control is the outlined
      // pill BUTTON, so the two read as button (navigate) vs. link (action).
      <button
        type="button"
        onClick={onClick}
        disabled={evaluating}
        className="link text-xs sm:text-sm cursor-pointer disabled:opacity-40"
      >
        {label}
      </button>
    ) : (
      <button
        type="button"
        onClick={onClick}
        disabled={evaluating}
        className="text-xs uppercase tracking-[0.2em] text-zinc-500 hover:text-zinc-200 disabled:opacity-40"
      >
        {label}
      </button>
    );

  return (
    <>
      {button}
      <ClaimProfileModal
        open={claimOpen}
        onClose={() => setClaimOpen(false)}
        evaluationId={evaluationId}
        firstName={firstName}
      />
      {evaluating && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Re-scoring"
          className="fixed inset-0 z-50 overflow-y-auto flex items-start sm:items-center justify-center bg-[#151515] p-6"
        >
          {/* text-left: this modal renders inside the profile page's .text-center
              subtree and would otherwise inherit centering (the logo keeps its
              own self-center). */}
          <div className="w-full max-w-md flex flex-col gap-6 my-auto py-8 text-left">
            <a
              href="/?home=1"
              aria-label="Founder Festival home"
              className="self-center opacity-90 hover:opacity-100 transition-opacity"
            >
              <img
                src="/images/founder-festival-logo.png"
                alt="Founder Festival"
                width={498}
                height={444}
                className="w-[72px] h-auto"
              />
            </a>
            <div className="flex flex-col gap-2">
              <div className="text-lg sm:text-xl font-bold text-white">
                Re-scoring you for membership
              </div>
              <div className="text-xs text-zinc-500">
                This usually takes about a minute.
              </div>
            </div>
            <div className="rounded-md border border-zinc-800 bg-black p-5">
              <EvalProgress
                steps={EVAL_STEPS}
                done={evalDone}
                onAllDone={handleAllProgressDone}
                finale={tally}
              />
            </div>
          </div>
        </div>
      )}
      {error && (
        <div className="text-sm text-red-400 mt-2">{error}</div>
      )}
    </>
  );
}
