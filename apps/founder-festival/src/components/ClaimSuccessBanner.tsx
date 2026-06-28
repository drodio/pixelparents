"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Signal =
  | "linkedin-email-exact"
  | "linkedin-email-name-company"
  | "linkedin-name-match"
  | "github-username"
  | "email-exact"
  | "email-name-company";

const LABELS: Record<Signal, string> = {
  "linkedin-email-exact": "LinkedIn email match",
  "linkedin-email-name-company": "LinkedIn email (name + company) match",
  "linkedin-name-match": "LinkedIn name match",
  "github-username": "GitHub username match",
  "email-exact": "Email match",
  "email-name-company": "Email match (name + company)",
};

export function ClaimSuccessBanner() {
  const router = useRouter();
  const params = useSearchParams();
  const claimed = params.get("claimed") as Signal | null;
  const [visible, setVisible] = useState(true);

  // Strip the query param on mount so a hard refresh doesn't re-show the banner.
  useEffect(() => {
    if (!claimed) return;
    const next = new URLSearchParams(params.toString());
    next.delete("claimed");
    const qs = next.toString();
    const path = window.location.pathname + (qs ? `?${qs}` : "");
    router.replace(path, { scroll: false });
  }, [claimed, params, router]);

  if (!claimed || !LABELS[claimed] || !visible) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-4 rounded-md border border-[#dfa43a]/40 bg-[#dfa43a]/10 px-4 py-3 text-sm text-[#dfa43a]"
    >
      <span>
        ✓ Confirmed you own this profile via <strong>{LABELS[claimed]}</strong>.
      </span>
      <button
        type="button"
        onClick={() => setVisible(false)}
        className="text-[#dfa43a]/70 hover:text-[#dfa43a]"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
