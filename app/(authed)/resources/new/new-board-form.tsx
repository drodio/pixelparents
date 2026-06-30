"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BOARD_TITLE_MAX, BOARD_DESC_MAX } from "@/lib/resources-label";
import { createBoardAction } from "../actions";

const controlCls =
  "w-full rounded-md border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-amber-400/50";

// Create-board form. Title required, description optional; topic tags are
// auto-generated server-side on submit (no tag input — the AI/heuristic labeler
// handles it). On success we route to the new board's detail page.
export function NewBoardForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await createBoardAction({ title, description });
      if (res.ok && res.id) {
        router.push(`/resources/${res.id}`);
        router.refresh();
      } else if (!res.ok) {
        setError(res.error);
      }
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-white/80">Board title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={BOARD_TITLE_MAX}
          placeholder="e.g. AP Calculus BC — study links & past papers"
          className={controlCls}
          autoFocus
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-white/80">
          Description <span className="font-normal text-white/45">(optional)</span>
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={BOARD_DESC_MAX}
          rows={4}
          placeholder="What belongs on this board? Who is it for?"
          className={controlCls}
        />
      </label>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !title.trim()}
          className="rounded-full bg-amber-400 px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create board"}
        </button>
        <span className="text-xs text-white/40">Topic tags are added automatically.</span>
      </div>
    </form>
  );
}
