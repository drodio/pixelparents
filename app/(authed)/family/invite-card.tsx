"use client";

import { useState } from "react";
import { IconHeart, IconMail, IconSparkles, IconUsers } from "@/components/icons";
import { parseInviteEmails } from "@/lib/invite";
import { sendCoParentInvites } from "@/app/signup/actions";

// A read-only link field + copy-to-clipboard button. Mirrors the share-settings
// copy pattern (native navigator.clipboard, graceful fallback to manual select).
function CopyLink({ url, label }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the link is selectable for manual copy */
    }
  }
  return (
    <div className="flex items-center gap-3">
      <code
        aria-label={label ?? "Invite link"}
        className="flex-1 overflow-x-auto rounded-md border border-white/10 bg-black/60 px-3 py-2 font-mono text-xs text-white/90"
      >
        {url}
      </code>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded-md border border-white/20 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
      >
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}

// 1) FAMILY INVITE — bring a co-parent into THIS family. Shareable join link
// (copy) + the existing email send. Reuses the family inviteToken + the
// sendCoParentInvites action + the /signup/join/[token] flow.
export function FamilyInviteCard({
  signupId,
  joinUrl,
}: {
  signupId: string;
  joinUrl: string;
}) {
  const [raw, setRaw] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [note, setNote] = useState<string | null>(null);

  async function onSend() {
    setNote(null);
    const emails = parseInviteEmails(raw);
    if (emails.length === 0) {
      setNote("Enter one or more valid email addresses, separated by commas.");
      return;
    }
    setState("sending");
    try {
      const res = await sendCoParentInvites(signupId, emails);
      if (res.ok && res.sent > 0) {
        setState("sent");
        setRaw("");
        setNote(
          res.sent === res.requested
            ? `Invite${res.sent > 1 ? "s" : ""} sent.`
            : `Sent ${res.sent} of ${res.requested}. You may have hit the invite limit.`,
        );
      } else if (res.error === "limit") {
        setState("error");
        setNote("You've reached the invite limit for this family.");
      } else {
        setState("error");
        setNote("We couldn't send those invites. Please try again.");
      }
    } catch {
      setState("error");
      setNote("Something went wrong. Please try again.");
    }
  }

  return (
    <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <IconHeart className="mt-0.5 h-6 w-6 shrink-0 text-amber-300" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-white">Invite your co-parent</h3>
          <p className="mt-0.5 text-sm text-white/65">
            Add your spouse or your child&apos;s other parent to your family. They&apos;ll
            fill out their own profile, and you&apos;ll share the same kids — edit
            everything together.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-4">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-white/45">
            Share your private family link
          </p>
          <CopyLink url={joinUrl} label="Family invite link" />
          <p className="mt-1.5 text-xs text-white/40">
            Anyone with this link can join your family and edit shared details, so
            share it only with your co-parent.
          </p>
        </div>

        <div className="border-t border-white/10 pt-4">
          <label
            htmlFor="familyInviteEmails"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/45"
          >
            Or email them an invite
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="familyInviteEmails"
              type="text"
              inputMode="email"
              autoComplete="off"
              placeholder="parent@example.com"
              value={raw}
              onChange={(e) => {
                setRaw(e.target.value);
                if (state !== "idle") setState("idle");
              }}
              className="flex-1 rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
            />
            <button
              type="button"
              onClick={onSend}
              disabled={state === "sending"}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-60"
            >
              <IconMail className="h-4 w-4" />
              {state === "sending" ? "Sending…" : "Send invite"}
            </button>
          </div>
          {note && (
            <p
              className={`mt-2 text-sm ${state === "error" ? "text-red-400" : "text-amber-300"}`}
              role="status"
            >
              {note}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// 2) INVITE ANOTHER OHS FAMILY — "spread the word". A shareable public signup
// link carrying this family's referral token (?ref=…). Pulls brand-new families
// into Pixel Parents. No email send — just a link to share anywhere.
export function SpreadTheWordCard({ referralUrl }: { referralUrl: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <IconUsers className="mt-0.5 h-6 w-6 shrink-0 text-amber-300" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-white">Invite another OHS family</h3>
          <p className="mt-0.5 text-sm text-white/65">
            Know an OHS family who&apos;d love this? Share your link — the more
            families here, the more our students can connect around what they love.
          </p>
        </div>
      </div>
      <div className="mt-5">
        <CopyLink url={referralUrl} label="OHS family invite link" />
        <p className="mt-1.5 text-xs text-white/40">
          This opens our sign-up page. Share it in a class group chat, a parent
          email thread, or anywhere OHS families gather.
        </p>
      </div>
    </div>
  );
}

// 3) STUDENT-TO-STUDENT REFERRAL — verification-gated. Only rendered for a
// family with at least one verified OHS student. A shareable link that lands a
// friend in the STUDENT signup path. Privacy-safe: just a referral token, no PII.
export function StudentReferralCard({ referralUrl }: { referralUrl: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <IconSparkles className="mt-0.5 h-6 w-6 shrink-0 text-amber-300" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-white">Invite a friend at OHS</h3>
          <p className="mt-0.5 text-sm text-white/65">
            Got an OHS friend who builds, makes, or wants to? Send them your link —
            it drops them straight into the student sign-up so they can join in.
          </p>
        </div>
      </div>
      <div className="mt-5">
        <CopyLink url={referralUrl} label="Student referral link" />
        <p className="mt-1.5 text-xs text-white/40">
          Your friend signs up on their own — your link just lets us know you sent
          them. Nothing about you is shared.
        </p>
      </div>
    </div>
  );
}
