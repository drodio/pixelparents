"use client";

import { useState } from "react";
import { ClaimProfileModal } from "./ClaimProfileModal";

type Props = {
  evaluationId: string;
  firstName?: string | null;
};

// "Is this you? Claim your profile to add your information." for a low-signal
// profile, where "Claim your profile" is a gold link that opens the claim modal.
export function LowSignalClaimCTA({ evaluationId, firstName }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <p className="text-zinc-400">
        Is this you?{" "}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[#D4A24A] hover:text-[#E0B05A]"
        >
          Claim your profile
        </button>{" "}
        to add your information.
      </p>
      <ClaimProfileModal
        open={open}
        onClose={() => setOpen(false)}
        evaluationId={evaluationId}
        initialBanner={null}
        firstName={firstName}
      />
    </>
  );
}
