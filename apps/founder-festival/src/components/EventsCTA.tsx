"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClaimProfileModal } from "./ClaimProfileModal";

type Props = {
  evaluationId: string;
  isOwner: boolean;
  // When the claim callback fails for GitHub or email, the welcome page
  // passes this so the modal auto-opens with a yellow steering banner.
  initialBanner?: {
    kind: "claim_failed";
    provider: "github" | "email";
  } | null;
  firstName?: string | null;
};

// The "Show me Founder Festival Events I Qualify For" CTA.
// Unclaimed visitors → open Claim Your Profile modal first.
// Already-claimed users → straight to /verified.
export function EventsCTA({ evaluationId, isOwner, initialBanner, firstName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(initialBanner?.kind === "claim_failed" && !isOwner);

  function onClick() {
    if (isOwner) {
      router.push("/verified");
    } else {
      setOpen(true);
    }
  }

  return (
    <>
      <ClaimProfileModal
        open={open}
        onClose={() => setOpen(false)}
        evaluationId={evaluationId}
        initialBanner={initialBanner ?? null}
        firstName={firstName}
      />
      <button
        type="button"
        onClick={onClick}
        className="rounded-md bg-[#D4A24A] hover:bg-[#E0B05A] text-black font-medium px-6 h-12 inline-flex items-center text-sm sm:text-base"
      >
        Show me Founder Festival Events I Qualify For
      </button>
    </>
  );
}
