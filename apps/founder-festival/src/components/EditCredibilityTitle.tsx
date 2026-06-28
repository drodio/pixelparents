"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FiEdit2 } from "react-icons/fi";
import { ClaimProfileModal } from "./ClaimProfileModal";

// The credibility title (one-liner above the badges) with an inline edit pencil.
// Visibility of the pencil mirrors the events-CTA rule:
//   - owner            → pencil edits the title inline.
//   - non-member viewer→ pencil opens the claim modal ("claim to edit").
//   - member on someone else's profile → NO pencil (it isn't theirs).
export function EditCredibilityTitle({
  evaluationId,
  title,
  isOwner,
  viewerIsMember,
  firstName,
}: {
  evaluationId: string;
  title: string | null;
  isOwner: boolean;
  viewerIsMember: boolean;
  firstName: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title ?? "");
  const [saving, setSaving] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [current, setCurrent] = useState(title);

  // A claimed member viewing a profile that isn't theirs gets no pencil.
  const canEdit = isOwner;
  const canClaim = !isOwner && !viewerIsMember;
  const showPencil = canEdit || canClaim;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/profile/title", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ evaluationId, title: value }),
      });
      const data = (await res.json().catch(() => ({}))) as { title?: string | null };
      if (res.ok) {
        setCurrent(data.title ?? null);
        setEditing(false);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="flex w-full flex-col gap-2">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={2}
          maxLength={200}
          autoFocus
          placeholder="A one-line title for your profile"
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-display text-lg font-semibold text-zinc-100"
        />
        <div className="flex items-center gap-3 text-sm">
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="rounded-md bg-[#dfa43a] px-3 py-1 font-medium text-black hover:bg-[#e8b452] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setValue(current ?? "");
              setEditing(false);
            }}
            className="text-zinc-400 hover:text-white"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Nothing to show: no title and the viewer can't add one.
  if (!current && !showPencil) return null;

  return (
    <div className="group/title flex w-full items-start gap-2">
      {current ? (
        <p className="font-display text-lg font-semibold leading-snug text-zinc-100 sm:text-xl">
          {current}
        </p>
      ) : (
        canEdit && <p className="text-sm italic text-zinc-500">Add a title for your profile</p>
      )}
      {showPencil &&
        (canEdit ? (
          <button
            type="button"
            onClick={() => {
              setValue(current ?? "");
              setEditing(true);
            }}
            aria-label="Edit my title"
            title="Edit my title"
            className="mt-1 shrink-0 text-zinc-500 opacity-0 transition-opacity hover:text-amber-400 focus:opacity-100 group-hover/title:opacity-100"
          >
            <FiEdit2 className="h-4 w-4" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setClaimOpen(true)}
            aria-label="Claim your profile to edit your title"
            title="Claim your profile to edit your title"
            className="mt-1 shrink-0 text-zinc-500 opacity-0 transition-opacity hover:text-amber-400 focus:opacity-100 group-hover/title:opacity-100"
          >
            <FiEdit2 className="h-4 w-4" aria-hidden />
          </button>
        ))}
      {claimOpen && (
        <ClaimProfileModal
          open={claimOpen}
          onClose={() => setClaimOpen(false)}
          evaluationId={evaluationId}
          initialBanner={null}
          firstName={firstName}
        />
      )}
    </div>
  );
}
