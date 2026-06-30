"use client";

import { useState, useTransition } from "react";
import { IconArrowUp } from "@/components/icons";

// A compact, optimistic upvote toggle shared by boards + contributions. The
// caller supplies the toggle action; we flip local state immediately and
// reconcile with the server's authoritative count, rolling back on error. One
// vote per member is enforced server-side (UNIQUE constraint).
export function UpvoteButton({
  initialCount,
  initialUpvoted,
  onToggle,
  size = "md",
  label = "upvote",
}: {
  initialCount: number;
  initialUpvoted: boolean;
  onToggle: () => Promise<
    { ok: true; upvoted: boolean; count: number } | { ok: false; error: string }
  >;
  size?: "sm" | "md";
  label?: string;
}) {
  const [count, setCount] = useState(initialCount);
  const [upvoted, setUpvoted] = useState(initialUpvoted);
  const [pending, startTransition] = useTransition();

  const click = () => {
    // Optimistic flip.
    const prevUp = upvoted;
    const prevCount = count;
    const nextUp = !prevUp;
    setUpvoted(nextUp);
    setCount(prevCount + (nextUp ? 1 : -1));

    startTransition(async () => {
      const res = await onToggle();
      if (res.ok) {
        setUpvoted(res.upvoted);
        setCount(res.count);
      } else {
        // Roll back.
        setUpvoted(prevUp);
        setCount(prevCount);
      }
    });
  };

  const pad = size === "sm" ? "px-2 py-1 text-xs" : "px-2.5 py-1.5 text-sm";
  const icon = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        click();
      }}
      disabled={pending}
      aria-pressed={upvoted}
      aria-label={`${upvoted ? "Remove your " : ""}${label}${upvoted ? "" : ""} (${count})`}
      title={upvoted ? "Remove your upvote" : "Upvote"}
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold transition-colors disabled:opacity-60 ${pad} ${
        upvoted
          ? "border-amber-400/60 bg-amber-400/15 text-amber-200"
          : "border-white/15 bg-white/[0.04] text-white/65 hover:border-white/25 hover:text-white/90"
      }`}
    >
      <IconArrowUp className={icon} />
      {count}
    </button>
  );
}
