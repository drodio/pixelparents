"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { IconArrowRight, IconUsers } from "@/components/icons";
import { toggleUpvoteAction, toggleAttachAction } from "../actions";

// Upvote + attach/join controls for a Community post. One upvote per member and
// one join per member (DB-enforced); both are simple toggles with optimistic
// count updates that reconcile to the server's authoritative count. The author
// can engage too (their own post). On-theme dark/amber; the upvote arrow gives a
// small spring pop on activation unless prefers-reduced-motion is set.
export function EngagementBar({
  askId,
  initialUpvotes,
  initialAttachments,
  initialUpvoted,
  initialAttached,
  canEngage,
}: {
  askId: string;
  initialUpvotes: number;
  initialAttachments: number;
  initialUpvoted: boolean;
  initialAttached: boolean;
  canEngage: boolean;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [upvotes, setUpvotes] = useState(initialUpvotes);
  const [attachments, setAttachments] = useState(initialAttachments);
  const [upvoted, setUpvoted] = useState(initialUpvoted);
  const [attached, setAttached] = useState(initialAttached);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const upvote = () => {
    if (!canEngage) return;
    setError(null);
    // Optimistic flip.
    const nextUpvoted = !upvoted;
    setUpvoted(nextUpvoted);
    setUpvotes((n) => n + (nextUpvoted ? 1 : -1));
    startTransition(async () => {
      const res = await toggleUpvoteAction({ askId });
      if (res.ok) {
        setUpvoted(res.upvoted);
        setUpvotes(res.count);
      } else {
        // Roll back.
        setUpvoted(!nextUpvoted);
        setUpvotes((n) => n + (nextUpvoted ? -1 : 1));
        setError(res.error);
      }
    });
  };

  const attach = () => {
    if (!canEngage) return;
    setError(null);
    const nextAttached = !attached;
    setAttached(nextAttached);
    setAttachments((n) => n + (nextAttached ? 1 : -1));
    startTransition(async () => {
      const res = await toggleAttachAction({ askId });
      if (res.ok) {
        setAttached(res.attached);
        setAttachments(res.count);
        router.refresh(); // refresh the joiners list on the page
      } else {
        setAttached(!nextAttached);
        setAttachments((n) => n + (nextAttached ? -1 : 1));
        setError(res.error);
      }
    });
  };

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={upvote}
        disabled={pending || !canEngage}
        aria-pressed={upvoted}
        title={canEngage ? "Upvote this post" : "Verify to upvote"}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition disabled:opacity-60 ${
          upvoted
            ? "border-amber-400/50 bg-amber-400/15 text-amber-200"
            : "border-white/15 bg-white/[0.04] text-white/70 hover:bg-white/[0.08]"
        }`}
      >
        <motion.span
          key={`${upvoted}`}
          initial={reduce ? false : { scale: 0.6 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 18 }}
          className="inline-flex"
        >
          <IconArrowRight className="h-4 w-4 -rotate-90" strokeWidth={2.5} />
        </motion.span>
        <span className="tabular-nums">{upvotes}</span>
        <span className="sr-only">upvotes</span>
      </button>

      <button
        type="button"
        onClick={attach}
        disabled={pending || !canEngage}
        aria-pressed={attached}
        title={canEngage ? "I'd join this too" : "Verify to join"}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition disabled:opacity-60 ${
          attached
            ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-200"
            : "border-white/15 bg-white/[0.04] text-white/70 hover:bg-white/[0.08]"
        }`}
      >
        <IconUsers className="h-4 w-4" strokeWidth={2} />
        {attached ? "Joined" : "I'd join this too"}
        {attachments > 0 && (
          <span className="tabular-nums text-white/55">· {attachments}</span>
        )}
      </button>

      {error && <span className="text-sm text-red-300">{error}</span>}
    </div>
  );
}
