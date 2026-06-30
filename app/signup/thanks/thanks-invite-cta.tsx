"use client";

import { useState } from "react";
import { IconHeart } from "@/components/icons";

// A warm, light-touch "spread the word" CTA shown after signup: a shareable
// referral link (copy-to-clipboard) so a new family can pull in another OHS
// family. Reuses the family's existing inviteToken via a /signup?ref=… link —
// no PII, no new secret. Same copy pattern as share-settings.
export function ThanksInviteCta({ referralUrl }: { referralUrl: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the link is selectable for manual copy */
    }
  }

  return (
    <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <IconHeart className="mt-0.5 h-6 w-6 shrink-0 text-amber-300" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-white">Know another OHS family?</h3>
          <p className="mt-0.5 text-sm text-white/65">
            Pixel Parents gets better with every family. Share your link to invite
            another OHS family to join.
          </p>
        </div>
      </div>
      <div className="mt-5 flex items-center gap-3">
        <code
          aria-label="OHS family invite link"
          className="flex-1 overflow-x-auto rounded-md border border-white/10 bg-black/60 px-3 py-2 font-mono text-xs text-white/90"
        >
          {referralUrl}
        </code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-md border border-white/20 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
