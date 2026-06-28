"use client";

import { useState } from "react";
import { FiEdit2 } from "react-icons/fi";
import { ClaimProfileModal } from "./ClaimProfileModal";

type Props = {
  isOwner: boolean;
  evaluationId: string;
  firstName: string | null;
};

// Hover-revealed pencil next to the profile heading. For the owner: takes
// them to /account where they can change their nickname. For everyone else:
// opens the existing ClaimProfileModal so they can claim the profile (the
// only path to being able to change its display name).
//
// The hover behavior is driven by Tailwind group/group-hover on the parent
// container (see profile/page.tsx heading row). On touch devices the button
// stays at low opacity but is still tappable.
export function EditNameButton({ isOwner, evaluationId, firstName }: Props) {
  const [modalOpen, setModalOpen] = useState(false);

  if (isOwner) {
    // Anchor link → /account scrolls to the Profile URL & Nickname section
    // (id="profile-url-nickname" on ProfileSettingsSection).
    return (
      <a
        href="/account#profile-url-nickname"
        aria-label="Edit my name"
        title="Edit my name"
        className="text-zinc-500 hover:text-amber-400 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
      >
        <FiEdit2 className="h-4 w-4" aria-hidden />
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        aria-label="Claim this profile to change the name"
        title="Claim this profile to change the name"
        className="text-zinc-500 hover:text-amber-400 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
      >
        <FiEdit2 className="h-4 w-4" aria-hidden />
      </button>
      <ClaimProfileModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        evaluationId={evaluationId}
        firstName={firstName}
      />
    </>
  );
}
