"use client";

import { useState } from "react";

// HN-style upvote: a triangle + count. Optimistically toggles; POSTs to the
// vote route. Non-members get a disabled control with a "claim to vote" hint.
export function UpvoteButton({
  slug,
  targetType,
  targetId,
  initialScore,
  initialVoted,
  canVote,
}: {
  slug: string;
  targetType: "thread" | "comment";
  targetId: string;
  initialScore: number;
  initialVoted: boolean;
  canVote: boolean;
}) {
  const [score, setScore] = useState(initialScore);
  const [voted, setVoted] = useState(initialVoted);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (!canVote || busy) return;
    setBusy(true);
    // Optimistic.
    const prevVoted = voted;
    const prevScore = score;
    setVoted(!prevVoted);
    setScore(prevScore + (prevVoted ? -1 : 1));
    try {
      const res = await fetch(`/api/events/${slug}/chat/vote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetType, targetId }),
      });
      const data = (await res.json().catch(() => ({}))) as { voted?: boolean; score?: number };
      if (res.ok && typeof data.score === "number") {
        setVoted(!!data.voted);
        setScore(data.score);
      } else {
        setVoted(prevVoted);
        setScore(prevScore);
      }
    } catch {
      setVoted(prevVoted);
      setScore(prevScore);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!canVote || busy}
      title={canVote ? (voted ? "Remove upvote" : "Upvote") : "Claim your profile to upvote"}
      className={`flex w-9 shrink-0 flex-col items-center leading-none ${
        canVote ? "cursor-pointer" : "cursor-default"
      }`}
    >
      <span className={`text-base ${voted ? "text-[#dfa43a]" : "text-zinc-500"} ${canVote ? "hover:text-[#dfa43a]" : ""}`}>
        ▲
      </span>
      <span className={`text-xs tabular-nums ${voted ? "text-[#dfa43a]" : "text-zinc-400"}`}>{score}</span>
    </button>
  );
}
