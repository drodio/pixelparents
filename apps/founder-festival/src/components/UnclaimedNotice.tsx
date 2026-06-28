"use client";

import { useState } from "react";
import { ClaimProfileModal } from "./ClaimProfileModal";

type Props = {
  evaluationId: string;
  firstName?: string | null;
};

// Shown under the welcome line on unclaimed profiles. The italic grey notice
// sits beside a gold "Claim" link that opens the Claim Your Profile modal.
export function UnclaimedNotice({ evaluationId, firstName }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <p className="text-sm italic text-neutral-400">
        This profile has not been claimed and data may not be accurate.{" "}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="italic text-[#D4A24A] hover:text-[#E0B05A]"
        >
          Claim
        </button>
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
