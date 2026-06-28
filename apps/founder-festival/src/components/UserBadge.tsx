"use client";

import { useState } from "react";
import { UserButton, useAuth, useClerk } from "@clerk/nextjs";

type Props = {
  // Canonical profile URL for the signed-in user — already resolved to
  // /profile/<username> or /profile/<kind>/<slug> or the legacy
  // /profile?e=<id> by the (authed) layout. Null when no claim exists.
  profileHref?: string | null;
};

// Top-right corner of every page:
//   - signed in  → Clerk's UserButton dropdown with "View My Public Profile"
//     (if claimed), "Manage account", "Delete my profile", "Sign out".
//   - signed out → small "Log in" link for returning users who already
//     claimed a profile and just want back in without re-scoring. Clicking
//     opens Clerk's sign-in modal; after successful sign-in we send them
//     to `/` which auto-redirects claimed users to their /profile page
//     (per the homepage redirect logic).
//
// Clerk v7 removed the <SignedIn>/<SignedOut> control components from the
// main @clerk/nextjs export; we now gate on useAuth().isSignedIn.
export function UserBadge({ profileHref }: Props = {}) {
  const { isSignedIn, isLoaded } = useAuth();
  const clerk = useClerk();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!isLoaded) return null;
  if (isSignedIn) {
    return (
      <>
        <UserButton
          appearance={{
            elements: {
              avatarBox: "h-8 w-8",
            },
          }}
        >
          <UserButton.MenuItems>
            {profileHref && (
              <UserButton.Link
                label="Public Profile"
                labelIcon={<ProfileIcon />}
                href={profileHref}
              />
            )}
            {/* Reorder marker: Clerk's "manageAccount" built-in moves to this
                slot, so the "Public Profile" custom link above ends up sitting
                above "Manage account" instead of below it. */}
            <UserButton.Action label="manageAccount" />
            <UserButton.Link
              label="Account settings"
              labelIcon={<SettingsIcon />}
              href="/account"
            />
            <UserButton.Action
              label="Delete my profile"
              labelIcon={<TrashIcon />}
              onClick={() => setConfirmOpen(true)}
            />
          </UserButton.MenuItems>
        </UserButton>
        {confirmOpen && (
          <DeleteConfirmModal
            onCancel={() => setConfirmOpen(false)}
            onConfirm={async () => {
              try {
                const res = await fetch("/api/account/delete", { method: "POST" });
                if (!res.ok) {
                  const j = await res.json().catch(() => ({}));
                  alert(`Delete failed: ${j.error ?? res.status}`);
                  return;
                }
              } catch (e) {
                alert(`Delete failed: ${e instanceof Error ? e.message : "network error"}`);
                return;
              }
              // Server already deleted the Clerk user. We need to wipe the
              // browser's session cookie too — otherwise the next page load
              // hits Clerk's currentUser() with a token Clerk no longer
              // recognizes and throws a 404. clerk.signOut() handles the
              // cookie clear; we then HARD-RELOAD to "/" (not router.push)
              // so every server component on the next page re-evaluates with
              // a clean signed-out state.
              try {
                await clerk.signOut();
              } catch {
                // ignore — fall through to the hard reload
              }
              window.location.href = "/";
            }}
          />
        )}
      </>
    );
  }
  return (
    <button
      type="button"
      onClick={() => clerk.openSignIn({ fallbackRedirectUrl: "/" })}
      className="text-sm text-zinc-300 hover:text-white px-3 py-1.5 rounded-md border border-zinc-700 hover:border-zinc-500 bg-zinc-900/70 backdrop-blur-sm"
    >
      Log in
    </button>
  );
}

function ProfileIcon() {
  // Small person silhouette icon. Sized to match Clerk's other menu icons.
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="16"
      height="16"
    >
      <circle cx="8" cy="5.5" r="2.5" />
      <path d="M3 13.5c0-2.5 2.2-4 5-4s5 1.5 5 4" />
    </svg>
  );
}

function SettingsIcon() {
  // Small gear silhouette. Matches the 16×16 / stroke-1.5 / currentColor
  // style of the other dropdown icons.
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="16"
      height="16"
    >
      <circle cx="8" cy="8" r="2.25" />
      <path d="M8 1.5v1.5M8 13v1.5M1.5 8h1.5M13 8h1.5M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="16"
      height="16"
    >
      <polyline points="2.5,4 13.5,4" />
      <path d="M5 4V2.5h6V4" />
      <path d="M4 4l1 9.5h6l1-9.5" />
    </svg>
  );
}

function DeleteConfirmModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");
  const canDelete = typed === "DELETE";
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#1c1c1c] border border-zinc-800 rounded-lg max-w-md w-full p-6 sm:p-8 flex flex-col gap-5 text-zinc-100"
      >
        <h2 className="font-display text-2xl font-bold">Delete your profile?</h2>
        <p className="text-sm text-zinc-300 leading-relaxed">
          This permanently removes your evaluation, scores, badges, and account.
          It cannot be undone.
        </p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="delete-confirm-input" className="text-xs text-zinc-500">
            Type <span className="font-mono text-zinc-300">DELETE</span> to confirm:
          </label>
          <input
            id="delete-confirm-input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoFocus
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="rounded-md bg-black border border-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
          />
        </div>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-zinc-700 text-zinc-300 px-4 py-2 text-sm hover:border-zinc-500 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canDelete || busy}
            onClick={async () => {
              setBusy(true);
              try { await onConfirm(); } finally { setBusy(false); }
            }}
            className="rounded-md bg-red-600 hover:bg-red-500 text-white font-medium px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? "Deleting…" : "Delete my profile"}
          </button>
        </div>
      </div>
    </div>
  );
}
